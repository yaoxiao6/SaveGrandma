import { useCallback, useEffect, useRef, useState } from 'react';
import { OpenAIRealtimeWebRTC, RealtimeSession, type RealtimeItem } from '@openai/agents/realtime';
import { grandmaAgent } from './grandma';
import { GRANDMA_SPEED, GRANDMA_VOICE, REALTIME_MODEL } from './model';
import { ELEVENLABS_ENABLED, onSpeaking, speak, stopSpeaking } from './grandma-voice';

export type VoiceStatus = 'idle' | 'microphone' | 'connecting' | 'connected' | 'error';

const CONNECT_TIMEOUT_MS = 20_000;

async function fetchClientSecret() {
  const response = await fetch(`${import.meta.env.BASE_URL}api/realtime-token`, { method: 'POST' });
  const data = await response.json().catch(() => ({})) as { value?: string; error?: string };
  if (!response.ok || !data.value) throw new Error(data.error ?? `Token request failed (${response.status}).`);
  return data.value;
}

// With ElevenLabs, the model only writes text; each sentence is spoken as soon as it is complete.
const SENTENCE_END = /[.!?…]+["”’)]?\s+/;
function speakSentences(buffer: string, flush: boolean) {
  let rest = buffer;
  for (;;) {
    const match = SENTENCE_END.exec(rest);
    if (!match) break;
    const end = match.index + match[0].length;
    void speak(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (flush && rest.trim()) { void speak(rest); rest = ''; }
  return rest;
}

function lastTranscript(history: RealtimeItem[], role: 'user' | 'assistant') {
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item.type !== 'message' || item.role !== role) continue;
    if ('status' in item && item.status === 'in_progress') continue;
    for (const part of item.content) {
      const text = 'transcript' in part ? part.transcript : 'text' in part ? part.text : undefined;
      if (text) return text;
    }
  }
  return '';
}

/** One Realtime voice session with Grandma, connected to the shared game controller through tools. */
export function useVoice() {
  const session = useRef<RealtimeSession | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const releaseMicrophone = () => { microphone.current?.getTracks().forEach(track => track.stop()); microphone.current = null; };
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState('');
  const [grandmaSaid, setGrandmaSaid] = useState('');
  const [youSaid, setYouSaid] = useState('');
  const [speaking, setSpeaking] = useState(false);
  /** Increments each time the server decides the caller has finished speaking. Drives turn hand-off. */
  const [speechEnded, setSpeechEnded] = useState(0);
  /** Increments when the caller starts talking. Used for barge-in: Grandma stops when you speak. */
  const [speechStarted, setSpeechStarted] = useState(0);
  const responding = useRef(false);
  /** Grandma's speaker output. Hard-muted on the client during the player's turn so barge-in is instant. */
  const output = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);

  const disconnect = useCallback(() => {
    stopSpeaking();
    session.current?.close();
    session.current = null;
    output.current = null;
    releaseMicrophone();
    setStatus('idle'); setSpeaking(false); setMuted(false);
  }, []);

  const connect = useCallback(async () => {
    if (session.current) return;
    setError(''); setGrandmaSaid(''); setYouSaid('');
    // Call this from the click handler: the mic prompt and audio unlock must happen inside the user gesture.
    const audioElement = document.createElement('audio');
    output.current = audioElement;
    audioElement.autoplay = true;
    void audioElement.play().catch(() => {});
    setStatus('microphone');
    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone.current = mediaStream;
    } catch (e) {
      console.error('[voice] microphone', e);
      setStatus('error');
      setError('Microphone blocked. Click the icon left of the address bar, allow the microphone, then press ↻.');
      return;
    }
    setStatus('connecting');
    const s = new RealtimeSession(grandmaAgent, {
      transport: new OpenAIRealtimeWebRTC({ audioElement, mediaStream }),
      model: REALTIME_MODEL,
      config: {
        // Grandma's own voice: OpenAI writes her lines, ElevenLabs says them.
        ...(ELEVENLABS_ENABLED ? { outputModalities: ['text'] } : {}),
        audio: {
          input: { transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' }, turnDetection: { type: 'semantic_vad', eagerness: 'high', createResponse: false, interruptResponse: false } },
          output: { voice: GRANDMA_VOICE, speed: GRANDMA_SPEED },
        },
      },
    });
    session.current = s;
    if (ELEVENLABS_ENABLED) {
      let pending = ''; let responseId = '';
      s.transport.on('output_text_delta', event => {
        if (event.responseId !== responseId) { pending = speakSentences(pending, true); responseId = event.responseId; }
        pending = speakSentences(pending + event.delta, false);
      });
      s.transport.on('*', event => { if (event.type === 'response.done') pending = speakSentences(pending, true); });
    }
    s.on('history_updated', history => {
      setGrandmaSaid(lastTranscript(history, 'assistant'));
      setYouSaid(lastTranscript(history, 'user'));
    });
    s.on('transport_event', event => {
      if (event.type === 'input_audio_buffer.speech_started') { console.info('[voice] caller started speaking'); setSpeechStarted(n => n + 1); }
      if (event.type === 'input_audio_buffer.committed') { console.info('[voice] caller finished speaking'); setSpeechEnded(n => n + 1); }
      if (event.type === 'response.created') responding.current = true;
      if (event.type === 'response.done') responding.current = false;
    });
    s.on('audio_start', () => setSpeaking(true));
    s.on('audio_stopped', () => setSpeaking(false));
    s.on('audio_interrupted', () => setSpeaking(false));
    s.on('error', ({ error: e }) => { console.error('[voice]', e); setError(e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Voice error'); });
    try {
      console.info('[voice] connecting');
      await Promise.race([
        s.connect({ apiKey: fetchClientSecret }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Voice connection timed out. Check your network and press ↻.')), CONNECT_TIMEOUT_MS)),
      ]);
      console.info('[voice] connected');
      if (session.current !== s) return;
      setStatus('connected');
    } catch (e) {
      console.error('[voice] connect failed', e);
      releaseMicrophone();
      if (session.current === s) { session.current = null; s.close(); }
      setStatus('error'); setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const setMute = useCallback((value: boolean) => { session.current?.mute(value); setMuted(value); }, []);

  /** Grandma speaks first; the intro calls this once the phone has stopped ringing. Her instructions say how to open the call. */
  const greet = useCallback(() => {
    session.current?.transport.sendEvent({ type: 'response.create', response: {
      instructions: 'Open the call with ONE short, frantic sentence of at most 15 words: you are in the bathroom and water is pouring out from under the sink. Do not call any tools and do not describe the room. Then stop and wait for the caller.',
    } });
  }, []);
  /** Cut Grandma off mid-sentence (intro time cap, barge-in). */
  const hush = useCallback(() => {
    console.info('[voice] hush');
    session.current?.interrupt();
    // Belt and braces: whatever audio already reached the browser stops now, not when the server catches up.
    const el = output.current; if (el) { el.muted = true; window.setTimeout(() => { if (el === output.current && !holdOutputMuted.current) el.muted = false; }, 600); }
  }, []);
  const holdOutputMuted = useRef(false);
  /** Keep Grandma's speaker silent while it is the player's turn. */
  const setOutputMuted = useCallback((value: boolean) => { holdOutputMuted.current = value; if (output.current) output.current.muted = value; }, []);

  /** Tell Grandma about something that happened outside a tool call, e.g. the leak stopping. */
  const notify = useCallback((text: string) => { session.current?.sendMessage(text); }, []);
  /** Make Grandma say one exact line (win/lose screens). */
  const sayLine = useCallback((text: string) => {
    const s = session.current; if (!s) return;
    s.interrupt();
    s.transport.sendEvent({ type: 'response.create', response: { instructions: `Say exactly this and nothing else, in character: "${text}"` } });
  }, []);

  // ElevenLabs (or fallback) playback drives the same speaking indicator as OpenAI audio would.
  useEffect(() => onSpeaking(setSpeaking), []);
  useEffect(() => () => { stopSpeaking(); session.current?.close(); session.current = null; releaseMicrophone(); }, []);

  /** End of the player's turn: Grandma answers whatever was said and acts on it. */
  const respond = useCallback(() => { if (responding.current) return; session.current?.transport.sendEvent({ type: 'response.create' }); }, []);

  return { status, error, grandmaSaid, youSaid, speaking, speechStarted, speechEnded, muted, connect, disconnect, setMute, setOutputMuted, notify, sayLine, greet, respond, hush };
}
