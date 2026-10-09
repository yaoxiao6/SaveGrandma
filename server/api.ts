import { REALTIME_MODEL } from '../src/voice/model';

// The two server routes, shared by the Vite dev/preview middleware (vite.config.ts) and the
// production Lambda (server/lambda.ts). Keys stay server-side; the browser only sees results.

export type ApiResult = { status: number; contentType: string; body: string | ReadableStream<Uint8Array> };

const json = (status: number, value: unknown): ApiResult => ({ status, contentType: 'application/json', body: JSON.stringify(value) });
const text = (status: number, value: string): ApiResult => ({ status, contentType: 'text/plain; charset=utf-8', body: value });

/** Mints a short-lived Realtime client secret so OPENAI_API_KEY never reaches the browser. */
export async function realtimeToken(apiKey: string | undefined): Promise<ApiResult> {
  if (!apiKey) return json(500, { error: 'OPENAI_API_KEY is not set.' });
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: { type: 'realtime', model: REALTIME_MODEL } }),
    });
    const data = await response.json() as { value?: string; error?: { message?: string } };
    if (!response.ok || !data.value) return json(502, { error: data.error?.message ?? 'Could not create a Realtime client secret.' });
    return json(200, { value: data.value });
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) });
  }
}

// Grandma's ElevenLabs voice. The browser posts { text }; the key and voice ID stay here.
const ELEVENLABS_MODEL = 'eleven_flash_v2_5';
export async function speak(apiKey: string | undefined, voiceId: string | undefined, rawBody: string): Promise<ApiResult> {
  if (!apiKey || !voiceId) return text(500, 'ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID are not set.');
  try {
    const { text: line } = JSON.parse(rawBody || '{}') as { text?: string };
    if (typeof line !== 'string' || !line.trim() || line.length > 1000) return text(400, 'Expected { text } under 1000 characters.');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: line, model_id: ELEVENLABS_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } }),
    });
    if (!response.ok || !response.body) return text(502, `ElevenLabs ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`);
    return { status: 200, contentType: 'audio/mpeg', body: response.body };
  } catch (error) {
    return text(502, error instanceof Error ? error.message : String(error));
  }
}
