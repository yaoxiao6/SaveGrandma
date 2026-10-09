import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { ServerResponse } from 'node:http';

import { realtimeToken, speak, type ApiResult } from './server/api';

// Production serves the game at https://yaox.ai/savegrandma/ (see docs/DEPLOY.md).
const BASE = '/savegrandma/';

async function send(res: ServerResponse, result: ApiResult) {
  res.statusCode = result.status;
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Cache-Control', 'no-store');
  if (typeof result.body === 'string') { res.end(result.body); return; }
  const reader = result.body.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
  res.end();
}

// Dev/preview stand-ins for the production API Lambda (server/lambda.ts). Keys come from .env.local.
function api(env: Record<string, string>): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const path = req.url?.split('?')[0] ?? '';
    if (req.method !== 'POST' || !path.includes('/api/')) return next();
    if (path === '/api/realtime-token' || path === `${BASE}api/realtime-token`) return send(res, await realtimeToken(env.OPENAI_API_KEY));
    if (path === '/api/speak' || path === `${BASE}api/speak`) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      return send(res, await speak(env.ELEVENLABS_API_KEY, env.ELEVENLABS_VOICE_ID, Buffer.concat(chunks).toString('utf8')));
    }
    next();
  };
  return { name: 'save-grandma-api', configureServer: server => { server.middlewares.use(handler); }, configurePreviewServer: server => { server.middlewares.use(handler); } };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // The production build sets VITE_ELEVENLABS_VOICE=true; its keys live in SSM, not here.
  const elevenlabs = env.VITE_ELEVENLABS_VOICE === 'true' || !!(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID);
  return {
    base: BASE,
    plugins: [react(), api(env)],
    // Tells the browser whether Grandma's ElevenLabs voice is available (never the key itself).
    define: { 'import.meta.env.VITE_ELEVENLABS_VOICE': JSON.stringify(String(elevenlabs)) },
    build: { rollupOptions: { output: { manualChunks: { three: ['three', '@react-three/fiber'] } } } },
  };
});
