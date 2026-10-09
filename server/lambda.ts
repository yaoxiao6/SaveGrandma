import { pipeline } from 'node:stream/promises';
import { Readable, type Writable } from 'node:stream';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { realtimeToken, speak, type ApiResult } from './api';

// Production API for https://yaox.ai/savegrandma/api/*, behind CloudFront via a streaming Lambda
// function URL. Secrets live in SSM Parameter Store and are re-read every few minutes, so editing
// them in the AWS console takes effect without a redeploy.

type FunctionUrlEvent = { rawPath: string; body?: string; isBase64Encoded?: boolean; headers: Record<string, string | undefined>; requestContext: { http: { method: string } } };
type ResponseStream = Writable;
declare const awslambda: {
  streamifyResponse(handler: (event: FunctionUrlEvent, stream: ResponseStream) => Promise<void>): unknown;
  HttpResponseStream: { from(stream: ResponseStream, meta: { statusCode: number; headers: Record<string, string> }): ResponseStream };
};

const PLACEHOLDER = 'PLACEHOLDER';
const CACHE_MS = 5 * 60_000;
const ssm = new SSMClient({});
let cached: { at: number; values: Record<string, string | undefined> } | undefined;

/** A missing parameter or one still set to PLACEHOLDER counts as unset. */
async function getParam(name: string): Promise<string | undefined> {
  try {
    const out = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    const value = out.Parameter?.Value?.trim();
    return value && value !== PLACEHOLDER ? value : undefined;
  } catch {
    return undefined;
  }
}

async function secrets() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.values;
  const prefix = process.env.PARAM_PREFIX ?? '/savegrandma';
  const [openai, elevenKey, elevenVoice] = await Promise.all([
    getParam(`${prefix}/openai-api-key`), getParam(`${prefix}/elevenlabs-api-key`), getParam(`${prefix}/elevenlabs-voice-id`),
  ]);
  cached = { at: Date.now(), values: { openai, elevenKey, elevenVoice } };
  return cached.values;
}

async function route(event: FunctionUrlEvent): Promise<ApiResult> {
  const notFound: ApiResult = { status: 404, contentType: 'text/plain', body: 'Not found' };
  if (event.headers['x-origin-verify'] !== process.env.ORIGIN_SECRET) return { status: 403, contentType: 'text/plain', body: 'Forbidden' };
  if (event.requestContext.http.method !== 'POST') return notFound;
  const path = event.rawPath;
  if (path.endsWith('/api/realtime-token')) return realtimeToken((await secrets()).openai);
  if (path.endsWith('/api/speak')) {
    const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
    const s = await secrets();
    return speak(s.elevenKey, s.elevenVoice, body);
  }
  return notFound;
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const result = await route(event);
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: result.status,
    headers: { 'Content-Type': result.contentType, 'Cache-Control': 'no-store' },
  });
  if (typeof result.body === 'string') { stream.end(result.body); return; }
  await pipeline(Readable.fromWeb(result.body as import('node:stream/web').ReadableStream), stream);
});
