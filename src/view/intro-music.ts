import { useEffect, useRef } from 'react';

/** Title-screen music. Served from public/audio; swap the file to change the track. */
export const INTRO_TRACK = '/audio/buant-two-step.mp3';
const LEVELS = { title: 0.5, intro: 0.22 } as const;
const FADE_MS = 1400;
const STOP_MS = 350;

export type MusicMode = keyof typeof LEVELS | 'off';

/**
 * Loops the track on the title screen, ducks under the ringing phone and Grandma's greeting
 * during the intro, then fades out when the call goes live. Browsers block sound before the
 * first interaction, so if autoplay is refused the music starts on the first click or key press.
 */
export function useIntroMusic(mode: MusicMode) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const fade = useRef<number | null>(null);

  useEffect(() => {
    const element = new Audio(INTRO_TRACK);
    element.loop = true;
    element.preload = 'auto';
    audio.current = element;
    return () => { element.pause(); element.src = ''; audio.current = null; };
  }, []);

  const current = useRef<MusicMode>(mode);
  current.current = mode;

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    if (fade.current) { cancelAnimationFrame(fade.current); fade.current = null; }
    const ramp = (to: number, then?: () => void, duration = FADE_MS) => {
      const from = element.volume; const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        element.volume = Math.min(1, Math.max(0, from + (to - from) * t));
        if (t < 1) fade.current = requestAnimationFrame(step); else { fade.current = null; then?.(); }
      };
      fade.current = requestAnimationFrame(step);
    };
    // Autoplay may be refused until the first gesture. That gesture is often the Start click itself,
    // so the unlock must never restart music once the mode has moved to 'off'.
    const unlock = () => { if (current.current === mode && mode !== 'off') void play(); };
    const removeUnlock = () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    const play = () => element.play().then(() => { if (current.current === mode) ramp(LEVELS[mode as keyof typeof LEVELS]); }).catch(() => {});
    if (mode === 'off') {
      // Pressing Start stops the music quickly so the ringing phone has the stage.
      removeUnlock();
      if (element.paused) { element.volume = 0; return; }
      ramp(0, () => { element.pause(); element.currentTime = 0; }, STOP_MS);
      return;
    }
    const target = LEVELS[mode];
    if (element.paused) {
      element.volume = mode === 'title' ? 0 : element.volume;
      void element.play().then(() => { if (current.current === mode) ramp(target); }).catch(() => {
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
      });
    } else ramp(target);
    return removeUnlock;
  }, [mode]);
}
