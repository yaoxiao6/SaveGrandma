/**
 * Grandma's spoken lines, in her own ElevenLabs voice.
 *
 * `speak(text)` queues a line; lines play back to back in order. `stopSpeaking()` drops the
 * queue and cuts the current line (hang-up, restart). Audio comes from `POST /api/speak` in
 * vite.config.ts, so the ElevenLabs key never reaches the browser. If the proxy is missing or
 * fails, the browser's own speech synthesis fills in so the demo still talks.
 */
export const ELEVENLABS_ENABLED = import.meta.env.VITE_ELEVENLABS_VOICE === 'true';

type Listener = (speaking: boolean) => void;
const listeners = new Set<Listener>();
/** Observe whether Grandma is currently talking through this module. */
export function onSpeaking(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }
let speaking = false;
const setSpeaking = (value: boolean) => { if (speaking === value) return; speaking = value; listeners.forEach(l => l(value)); };

const cache = new Map<string, Promise<string>>();
function fetchAudioUrl(text: string) {
  const cached = cache.get(text);
  if (cached) return cached;
  const pending = (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}api/speak`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!response.ok) throw new Error(`speak proxy ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
    return URL.createObjectURL(await response.blob());
  })();
  cache.set(text, pending);
  pending.catch(() => cache.delete(text));
  return pending;
}

type Job = { text: string; audio: Promise<string>; resolve: () => void };
const queue: Job[] = [];
let generation = 0;
let player: HTMLAudioElement | null = null;
let draining = false;

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const job = queue.shift()!;
    const myGeneration = generation;
    try {
      const url = await job.audio;
      if (myGeneration !== generation) { job.resolve(); continue; }
      await new Promise<void>(done => {
        const audio = new Audio(url);
        player = audio;
        audio.onended = audio.onerror = () => { if (player === audio) player = null; done(); };
        setSpeaking(true);
        audio.play().catch(() => done());
      });
    } catch (error) {
      console.warn('[grandma-voice] falling back to browser speech:', error);
      if (myGeneration === generation) await speakWithBrowser(job.text);
    }
    job.resolve();
  }
  setSpeaking(false);
  draining = false;
}

export function speak(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return Promise.resolve();
  if (!ELEVENLABS_ENABLED) return speakWithBrowser(trimmed);
  return new Promise(resolve => { queue.push({ text: trimmed, audio: fetchAudioUrl(trimmed), resolve }); void drain(); });
}

export function stopSpeaking() {
  generation++;
  queue.splice(0).forEach(job => job.resolve());
  if (player) { player.pause(); player.src = ''; player = null; }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  current = null;
  setSpeaking(false);
}

// Browser speech synthesis fallback.
let current: SpeechSynthesisUtterance | null = null;
function speakWithBrowser(text: string): Promise<void> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve();
  if (current) speechSynthesis.cancel();
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92; utterance.pitch = 1.25; utterance.volume = 1;
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => /en/i.test(v.lang) && /female|samantha|karen|moira|victoria|zira/i.test(v.name)) ?? voices.find(v => /^en/i.test(v.lang));
    if (preferred) utterance.voice = preferred;
    utterance.onend = utterance.onerror = () => { if (current === utterance) { current = null; setSpeaking(false); } resolve(); };
    current = utterance;
    setSpeaking(true);
    speechSynthesis.speak(utterance);
  });
}
