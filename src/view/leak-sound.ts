import { useEffect, useRef } from 'react';

/** Looping water ambience. Served from public/audio; swap the file to change the sound. */
export const LEAK_TRACK = '/audio/water-leak.mp3';
const BASE_VOLUME = 0.35;
const MAX_VOLUME = 0.85;
const FADE_MS = 500;

/**
 * Plays the leak loop while water is flowing during a live call. `intensity` is the leak rate
 * relative to its starting value (1 = normal, up to 4 after wrong turns) and raises the volume.
 * Fades out when the leak stops, the call pauses, or the game ends.
 */
export function useLeakSound(active: boolean, intensity: number) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const fade = useRef<number | null>(null);

  useEffect(() => {
    const element = new Audio(LEAK_TRACK);
    element.loop = true;
    element.preload = 'auto';
    element.volume = 0;
    audio.current = element;
    return () => { element.pause(); element.src = ''; audio.current = null; };
  }, []);

  const target = active ? Math.min(MAX_VOLUME, BASE_VOLUME + (Math.max(1, intensity) - 1) * 0.18) : 0;
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    if (fade.current) { cancelAnimationFrame(fade.current); fade.current = null; }
    const ramp = (to: number, then?: () => void) => {
      const from = element.volume; const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / FADE_MS);
        element.volume = Math.min(1, Math.max(0, from + (to - from) * t));
        if (t < 1) fade.current = requestAnimationFrame(step); else { fade.current = null; then?.(); }
      };
      fade.current = requestAnimationFrame(step);
    };
    if (target === 0) { if (!element.paused) ramp(0, () => element.pause()); return; }
    // Playback always follows a user gesture (Start), so autoplay is permitted here.
    if (element.paused) void element.play().then(() => ramp(target)).catch(() => {});
    else ramp(target);
  }, [target]);
}
