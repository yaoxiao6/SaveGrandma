# Save Grandma

A playable, placeholder bathroom emergency for the Fishathon team. The player sees through Grandma’s phone. A typed simulation controller executes instructions; the voice teammate will supply those instructions and turn results into dialogue.

## Run locally

Use Node 22.12+ (22 LTS or 24 LTS recommended).

```sh
npm ci
npm run dev
```

Voice: copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`, then restart the dev server. Answering the call connects Grandma (`gpt-realtime-2.1-mini` over WebRTC via the OpenAI Agents SDK); allow microphone access and talk to her. The key stays in the Vite server, which mints short-lived client secrets at `POST /api/realtime-token`. Voice code lives in `src/voice/`.

Open the printed localhost URL. Answer the call, then use the developer console. The quickest complete demo is **01 · Close the valve → Run preset**. **03 · Patch + clamp** demonstrates placing the phone down while Grandma works in its fixed view. Set simulation speed to 3× or 10× to inspect long scripts. Presets reset and start a fresh seeded run.

- `npm test` — deterministic simulation and controller tests.
- `npm run check` — TypeScript and simulation tests.
- `npm run build` — checked production build in `dist/`.
- `npm run preview` — serve the production build locally.
- `npm run smoke` — Chrome browser scenarios against the running dev server.
- `BROWSER_CHANNEL=msedge npm run smoke` — the same tests in installed desktop Edge.
- `SMOKE_URL=http://127.0.0.1:4173 SMOKE_PRODUCTION=1 npm run smoke` — verify the production player interface and bundle.

The developer panel is a conditional development-only import. Production builds omit its component and scripted presets. `/?player=1` previews the player interface during development. Gameplay in that interface awaits the voice adapter; there are no keyboard, mouse, or text-command gameplay controls. Call start, pause/resume, and restart remain available. Switching away from the browser tab pauses the session; resume explicitly when returning.

## What is implemented

- Sequential structured actions, phone selfie/rear cameras, Grandma-relative and camera-relative directions, procedural Grandma, room interactions, reaching, posture and hands.
- Three complete solutions: close valve, wrench repair, patch secured by clamp. Both patch steps require the phone on the dry shelf and a spare hand.
- Five minutes to flooding with no intervention. One-use towels and bucket add at most 24 and 36 seconds at the initial leak rate; they cannot solve the leak.
- Seeded stress-dependent ambiguity (15/30/45%). Precise instructions have no random interpretation failures. Unclear targets/directions return structured clarification results.
- Cancellation at safe points, pause/resume, full reset, stale-run rejection, progress/results/terminal events and a bounded queue.
- Development presets, individual action builder, ambiguous descriptions/qualifiers, event history, room map and diagnostic state.

## Team handoff

| Owner | Entry point |
| --- | --- |
| Voice | [Integration guide](docs/INTEGRATION.md), `src/game/index.ts`, `src/game/types.ts` |
| Creative | [Creative handoff](docs/CREATIVE.md), `src/view/Scene.tsx` |
| Game simulation | `src/game/controller.ts`, `src/game/config.ts` |
| Hackathon alignment | [Reviewed starter guidance](docs/HACKATHON.md) |
| Validation | [Checks and remaining browser verification](docs/VALIDATION.md) |

No voice SDK, microphone capture, natural-language parser, generated speech, voice clone, API credentials, external models, fonts, images, or sound assets are included. These are deliberately separate teammate responsibilities. Everything visible is procedural geometry and system typography, and the game runs without network calls after installation.

The custom React 19 + React Three Fiber 9 setup follows the [renderer’s compatibility guidance](https://r3f.docs.pmnd.rs/getting-started/installation). This is a standalone app, outside the starter repo’s `game-kit/` folder. See the hackathon notes for why the starter’s folder-specific JavaScript engine rules do not require a stack change here.
# help-me-grandma
