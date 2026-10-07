import { useEffect, useRef, useState, type FormEvent } from 'react';
import { gameCommands, gameController, simulation } from './game/session';
import Scene from './view/Scene';
import StartScreen from './view/StartScreen';
import Intro, { GREETING } from './view/Intro';
import Outro, { OUTRO_LINES } from './view/Outro';
import { speak } from './voice/grandma-voice';
import { EXAMPLES, parseInstruction } from './voice/text-commands';
import { useVoice } from './voice/useVoice';
import { useIntroMusic } from './view/intro-music';
import { PLAYER_TURN_SECONDS, useTurns } from './view/useTurns';

type Line = { id: number; who: 'you' | 'grandma' | 'note'; text: string };
let lineSerial = 0;
const line = (who: Line['who'], text: string): Line => ({ id: ++lineSerial, who, text });

export default function App() {
  const [world, setWorld] = useState(() => simulation.readState());
  const [started, setStarted] = useState(false);
  const [intro, setIntro] = useState<'pending' | 'playing' | 'done'>('pending');
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const transcript = useRef<HTMLDivElement>(null);
  // Yao's realtime voice agent. Connects when Grandma's greeting begins; typed text stays as a fallback.
  const voice = useVoice();
  useIntroMusic(started ? 'off' : 'title');
  const { setMute } = voice;
  const say = (who: Line['who'], text: string) => setLines(old => [...old, line(who, text)].slice(-40));
  useEffect(() => gameController.subscribe(event => {
    if (event.type === 'state_changed') setWorld(simulation.readState());
    if (event.type === 'action_result' && event.result.status !== 'cancelled') say('grandma', event.result.message);
    if (event.type === 'misunderstanding') say('note', `Grandma went for the ${event.selectedTarget.replaceAll('_', ' ')} instead.`);
    if (event.type === 'terminal') say('note', event.message);
  }), []);
  useEffect(() => {
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      simulation.advance((now - last) / 1000);
      last = now;
    }, 50);
    // A hidden tab pauses the call so browser throttling cannot decide a game.
    const visibility = () => { if (document.hidden) gameController.pause(); last = performance.now(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' }); }, [lines]);

  const running = world.stage === 'running';
  const terminal = world.stage === 'won' || world.stage === 'lost';
  // Turns: the player speaks or types inside a short window, then Grandma answers and acts.
  const turns = useTurns({
    enabled: running && intro === 'done',
    busy: !!world.active || world.queue.length > 0,
    speaking: voice.speaking,
    onPlayerTurnEnd: () => { if (voice.status === 'connected') voice.respond(); },
  });
  const playersTurn = turns.turn === 'player' && running && intro === 'done';
  // When the caller stops talking, the server commits their speech; that ends the turn with no button needed.
  useEffect(() => { if (voice.speechEnded && playersTurn) turns.endPlayerTurn(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [voice.speechEnded]);
  // The mic is open only during the player's turn, so input and output never overlap.
  useEffect(() => { setMute(!playersTurn); }, [playersTurn, setMute]);
  // Win and loss each have one fixed line from Grandma, spoken live when connected, synthesized otherwise.
  useEffect(() => {
    if (!terminal) return;
    const text = OUTRO_LINES[world.stage as 'won' | 'lost'];
    if (voice.status === 'connected') voice.sayLine(text); else void speak(text);
    say('grandma', text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal]);
  const voiceLabel = voice.status === 'connected' ? (playersTurn ? 'Listening… tap when you are done' : 'Tap to respond to Grandma') : voice.status === 'microphone' ? 'Allow the microphone…' : voice.status === 'connecting' ? 'Connecting voice…' : voice.status === 'error' ? 'Voice unavailable, tap to retry' : 'Tap to turn on voice';
  // Tapping the mic: connect voice if needed, otherwise take your turn (mic opens) or finish it.
  const onMic = () => {
    if (voice.status !== 'connected') { void voice.connect(); return; }
    if (playersTurn) turns.endPlayerTurn(); else turns.startPlayerTurn();
  };
  // Mirror the live conversation into the transcript; fall back to synthesized speech if voice is unavailable.
  useEffect(() => { if (voice.grandmaSaid) say('grandma', voice.grandmaSaid); }, [voice.grandmaSaid]);
  useEffect(() => { if (voice.youSaid) say('you', voice.youSaid); }, [voice.youSaid]);
  // Voice errors stay in the console and on the mic button label; they are not part of the call transcript.
  const elapsed = `${Math.floor(world.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(world.elapsed % 60).toString().padStart(2, '0')}`;

  // PLACEHOLDER for Yao's voice agent: typed text stands in for speech, then flows through the same command session.
  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !playersTurn) return;
    setDraft('');
    say('you', text);
    if (/^(help|\?)$/i.test(text)) { say('note', `Try: ${EXAMPLES.join(' · ')}`); return; }
    const parsed = parseInstruction(text);
    if (!parsed.ok) { say('note', parsed.hint); return; }
    turns.endPlayerTurn();
    const turn = gameCommands.beginTurn();
    void gameCommands.submit(turn.token, parsed.steps).then(outcome => {
      if (outcome.status === 'rejected') say('note', outcome.code === 'NOT_RUNNING' ? 'Answer the call first.' : `Could not send that (${outcome.code}).`);
    });
  };
  const restart = () => { voice.disconnect(); gameController.reset(); gameController.start(); setLines([]); void voice.connect().then(() => voice.greet()); };

  return <>
    {/* Connect inside the click so the mic prompt and audio unlock happen in the user gesture. */}
    {!started && <StartScreen onStart={() => { setStarted(true); setIntro('playing'); void voice.connect(); }} />}
    <div className="stage" inert={!started}>
      <div className="phone" data-testid="phone">
        <div className="camera-view" data-testid="camera-view"><Scene world={world} /></div>

        <div className="call-time"><span className={`dot ${running ? 'live' : ''}`} />{elapsed}</div>
        {intro === 'done' && running && <div className={`turn-banner ${turns.turn}`} role="status">
          <span className="turn-label">{turns.turn === 'player' ? 'Your turn · tell Grandma what to do' : voice.speaking ? 'Grandma is talking…' : world.active ? 'Grandma is on it…' : 'Grandma’s turn'}</span>
          {turns.turn === 'player' && <><span className="turn-count">{Math.ceil(turns.remaining)}</span><div className="turn-bar"><i style={{ width: `${turns.remaining / PLAYER_TURN_SECONDS * 100}%` }} /></div></>}
        </div>}
        {intro === 'playing' && <Intro voice={voice} onGreeting={live => { if (!live) say('grandma', GREETING); }} onDone={() => gameController.start()} onFinished={() => setIntro('done')} />}
        {world.stage === 'paused' && <div className="call-overlay"><div className="call-card compact"><span className="eyebrow">TAKE A BREATH</span><h2>Call paused.</h2><p>The water and Grandma’s actions are paused.</p><button className="primary" onClick={() => gameController.resume()}>Resume call ↗</button></div></div>}
        {terminal && <Outro outcome={world.stage as 'won' | 'lost'} onRestart={restart} />}

        <div className="call-bottom">
          <div className="transcript" ref={transcript} role="log" aria-live="polite" aria-label="Call transcript">
            {lines.map(l => <p key={l.id} className={l.who}>{l.who === 'you' ? 'You' : l.who === 'grandma' ? 'Grandma' : ''}{l.who !== 'note' && <b> · </b>}{l.text}</p>)}
          </div>
          {world.active && <div className="progress" aria-hidden="true"><i style={{ width: `${world.active.elapsed / world.active.duration * 100}%` }} /></div>}
          <div className="mic-row">
          <button type="button" className={`mic ${voice.status} ${voice.speaking ? 'speaking' : ''} ${playersTurn && voice.status === 'connected' ? 'listening' : 'muted'}`} aria-label={voiceLabel} title={voiceLabel} disabled={voice.status === 'microphone' || voice.status === 'connecting' || (voice.status === 'connected' && !running)} onClick={onMic}><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></svg></button>
          </div>
          {/* Typed fallback: only shown when the voice agent is not connected (mic blocked, no key, offline). */}
          {voice.status !== 'connected' && <form className="composer" onSubmit={send}>
            <input aria-label="Tell Grandma what to do" placeholder={!running ? 'Connecting…' : playersTurn ? 'Tell Grandma…' : 'Grandma’s turn…'} value={draft} onChange={e => setDraft(e.target.value)} autoComplete="off" disabled={!playersTurn} enterKeyHint="send" />
          </form>}
        </div>
      </div>
    </div>
  </>;
}
