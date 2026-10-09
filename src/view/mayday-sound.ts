import { useEffect, useRef } from 'react';

/** Looping alarm for the final minute. Served from public/audio; swap the file to change the sound. */
export const ALARM_TRACK = `${import.meta.env.BASE_URL}audio/alarm.mp3`;
const VOLUME = 0.22;
const FADE_MS = 400;

/** Plays the alarm loop quietly while `active`, fading in and out so it never cuts harshly. */
export function useMaydaySiren(active: boolean, cut = false) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const fade = useRef<number | null>(null);

  useEffect(() => {
    const element = new Audio(ALARM_TRACK);
    element.loop = true;
    element.preload = 'auto';
    element.volume = 0;
    audio.current = element;
    return () => { element.pause(); element.src = ''; audio.current = null; };
  }, []);

  // Game over: silence at once, no fade, so the outro owns the soundtrack.
  useEffect(() => {
    if (!cut) return;
    if (fade.current) { cancelAnimationFrame(fade.current); fade.current = null; }
    const element = audio.current;
    if (element) { element.pause(); element.currentTime = 0; element.volume = 0; }
  }, [cut]);

  useEffect(() => {
    const element = audio.current;
    if (!element || cut) return;
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
    if (!active) { if (!element.paused) ramp(0, () => { element.pause(); element.currentTime = 0; }); return; }
    // Playback always follows a user gesture (Start), so autoplay is permitted here.
    if (element.paused) void element.play().then(() => ramp(VOLUME)).catch(() => {});
    else ramp(VOLUME);
  }, [active, cut]);
}
