# Deploy: https://yaox.ai/savegrandma

The game ships with the yaox.ai CloudFront distribution, which the memory-palace CDK stack owns (`memory-palace/infra/lib/save-grandma.ts`).

- `npm run build:deploy` builds the client under base `/savegrandma/` with Grandma's ElevenLabs voice on, and bundles the API Lambda (`server/lambda.ts`) to `dist-server/`.
- `cd ../memory-palace/infra && AWS_PROFILE=memory-palace npm run deploy` builds both apps and deploys to the `memory-palace` AWS account (575292303087). `/savegrandma/api/*` goes to the Lambda; everything else under `/savegrandma` comes from S3.
- Secrets are in SSM Parameter Store (us-east-1): `/savegrandma/openai-api-key`, `/savegrandma/elevenlabs-api-key` and `/savegrandma/elevenlabs-voice-id`. Edit them in the AWS console (`memory-palace` account). The Lambda reads them again within 5 minutes, so you don't need to redeploy. A value of `PLACEHOLDER` counts as unset. Without ElevenLabs, Grandma uses the browser's own speech.
- **Known issue (2026-11-02):** the OpenAI key in `/savegrandma/openai-api-key` has expired, so `/savegrandma/api/realtime-token` returns 502 and realtime voice is off. Not being fixed for now; put a new key in SSM (`--profile memory-palace`) to restore it, no redeploy needed.

The route handlers (`server/api.ts`) are shared with the Vite dev/preview middleware, so local behavior matches production.
