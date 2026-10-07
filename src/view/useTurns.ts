import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Turn structure for the call. The player gets a short window to speak or type; then Grandma
 * takes her turn: she answers and performs the actions. Her turn ends once she has gone quiet
 * and no action is running, or after a hard cap. Input and output never overlap.
 */
export const PLAYER_TURN_SECONDS = 10;
export const GRANDMA_TURN_MAX_SECONDS = 40;
const GRANDMA_FIRST_ACTIVITY_GRACE_SECONDS = 8;
const GRANDMA_SETTLE_SECONDS = 1.5;

export type Turn = 'player' | 'grandma';

export function useTurns({ enabled, busy, speaking, onPlayerTurnEnd }: { enabled: boolean; busy: boolean; speaking: boolean; onPlayerTurnEnd: () => void }) {
  const [turn, setTurn] = useState<Turn>('player');
  const [remaining, setRemaining] = useState(PLAYER_TURN_SECONDS);
  const activity = useRef({ busy, speaking });
  activity.current = { busy, speaking };
  const onEnd = useRef(onPlayerTurnEnd);
  onEnd.current = onPlayerTurnEnd;

  /** The player taps the mic to respond: take the turn back from Grandma (or restart the clock). */
  const startPlayerTurn = useCallback(() => { setTurn('player'); setRemaining(PLAYER_TURN_SECONDS); }, []);

  const endPlayerTurn = useCallback(() => {
    setTurn(current => {
      if (current !== 'player') return current;
      onEnd.current();
      return 'grandma';
    });
  }, []);

  useEffect(() => {
    if (!enabled) { setTurn('player'); setRemaining(PLAYER_TURN_SECONDS); return; }
    const started = performance.now();
    let lastActivity = started;
    let sawActivity = false;
    const id = window.setInterval(() => {
      const now = performance.now();
      const elapsed = (now - started) / 1000;
      if (turn === 'player') {
        const left = Math.max(0, PLAYER_TURN_SECONDS - elapsed);
        setRemaining(left);
        if (left <= 0) endPlayerTurn();
        return;
      }
      const { busy, speaking } = activity.current;
      if (busy || speaking) { lastActivity = now; sawActivity = true; }
      const quiet = (now - lastActivity) / 1000;
      const settled = sawActivity ? quiet > GRANDMA_SETTLE_SECONDS : elapsed > GRANDMA_FIRST_ACTIVITY_GRACE_SECONDS;
      if (settled || elapsed > GRANDMA_TURN_MAX_SECONDS) { setTurn('player'); setRemaining(PLAYER_TURN_SECONDS); }
    }, 100);
    return () => clearInterval(id);
  }, [enabled, turn, endPlayerTurn]);

  return { turn, remaining, startPlayerTurn, endPlayerTurn };
}
