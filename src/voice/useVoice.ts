import { useCallback, useEffect, useRef, useState } from 'react';
import { OpenAIRealtimeWebRTC, RealtimeSession, type RealtimeItem } from '@openai/agents/realtime';
import { grandmaAgent } from './grandma';
import { GRANDMA_VOICE, REALTIME_MODEL } from './model';

export type VoiceStatus = 'idle' | 'microphone' | 'connecting' | 'connected' | 'error';

const CONNECT_TIMEOUT_MS = 20_000;

async function fetchClientSecret() {
  const response = await fetch('/api/realtime-token', { method: 'POST' });
  const data = await response.json().catch(() => ({})) as { value?: string; error?: string };
  if (!response.ok || !data.value) throw new Error(data.error ?? `Token request failed (${response.status}).`);
  return data.value;
}

function lastTranscript(history: RealtimeItem[], role: 'user' | 'assistant') {
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item.type !== 'message' || item.role !== role) continue;
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
  const [muted, setMuted] = useState(false);

  const disconnect = useCallback(() => {
    session.current?.close();
    session.current = null;
    releaseMicrophone();
    setStatus('idle'); setSpeaking(false); setMuted(false);
  }, []);

  const connect = useCallback(async () => {
    if (session.current) return;
    setError(''); setGrandmaSaid(''); setYouSaid('');
    // Call this from the click handler: the mic prompt and audio unlock must happen inside the user gesture.
    const audioElement = document.createElement('audio');
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
        audio: {
          input: { transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' }, turnDetection: { type: 'semantic_vad', eagerness: 'high' } },
          output: { voice: GRANDMA_VOICE },
        },
      },
    });
    session.current = s;
    s.on('history_updated', history => {
      setGrandmaSaid(lastTranscript(history, 'assistant'));
      setYouSaid(lastTranscript(history, 'user'));
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
      // Grandma speaks first; her instructions say how to open the call.
      s.transport.sendEvent({ type: 'response.create' });
    } catch (e) {
      console.error('[voice] connect failed', e);
      releaseMicrophone();
      if (session.current === s) { session.current = null; s.close(); }
      setStatus('error'); setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const setMute = useCallback((value: boolean) => { session.current?.mute(value); setMuted(value); }, []);

  /** Tell Grandma about something that happened outside a tool call, e.g. the leak stopping. */
  const notify = useCallback((text: string) => { session.current?.sendMessage(text); }, []);

  useEffect(() => () => { session.current?.close(); session.current = null; releaseMicrophone(); }, []);

  return { status, error, grandmaSaid, youSaid, speaking, muted, connect, disconnect, setMute, notify };
}
