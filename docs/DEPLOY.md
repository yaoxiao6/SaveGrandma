# Deploy: https://yaox.ai/savegrandma

The game ships with the yaox.ai CloudFront distribution, which the memory-palace CDK stack owns (`memory-palace/infra/lib/save-grandma.ts`).

- `npm run build:deploy` builds the client under base `/savegrandma/` with Grandma's ElevenLabs voice on, and bundles the API Lambda (`server/lambda.ts`) to `dist-server/`.
- `cd ../memory-palace/infra && npm run deploy` builds both apps and deploys. `/savegrandma/api/*` goes to the Lambda; everything else under `/savegrandma` comes from S3.
- Secrets are in SSM Parameter Store (us-east-1): `/savegrandma/openai-api-key`, `/savegrandma/elevenlabs-api-key` and `/savegrandma/elevenlabs-voice-id`. Edit them in the AWS console. The Lambda reads them again within 5 minutes, so you don't need to redeploy. A value of `PLACEHOLDER` counts as unset. Without ElevenLabs, Grandma uses the browser's own speech.

The route handlers (`server/api.ts`) are shared with the Vite dev/preview middleware, so local behavior matches production.
