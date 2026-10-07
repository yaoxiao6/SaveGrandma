# Save Grandma

A playable, placeholder bathroom emergency for the Fishathon team. The player sees through Grandma’s phone. A typed simulation controller executes instructions; the voice teammate will supply those instructions and turn results into dialogue.

## Run locally

Use Node 22.12+ (22 LTS or 24 LTS recommended).

```sh
npm ci
npm run dev
```

Voice: copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`, then restart the dev server. Starting the call connects Grandma (`gpt-realtime-2.1-mini` over WebRTC via the OpenAI Agents SDK); allow microphone access and talk to her. The key stays in the Vite server, which mints short-lived client secrets at `POST /api/realtime-token`. Voice code lives in `src/voice/`.

Open the printed localhost URL. The game is a portrait 9:16 phone screen, as if you were video-calling Grandma. Press Start, let the intro call connect, then type instructions in the field at the bottom and press Enter. The mic button above it is a placeholder for the voice agent. Typed text is a **placeholder for Yao’s voice agent**: it goes through a small keyword matcher in `src/voice/text-commands.ts` and then the same `gameCommands` bridge the voice adapter will use. Type `help` for example phrases. The call opens on the front camera, looking at Grandma; asking her to switch to the rear camera is part of the challenge. The quickest win is `switch to the rear camera, go to the valve, turn the valve clockwise`. Compound lines split on commas, “then” and “and”, and stop at the first failed step.

- `npm test` — deterministic simulation and controller tests.
- `npm run check` — TypeScript and simulation tests.
- `npm run build` — checked production build in `dist/`.
- `npm run preview` — serve the production build locally.
- `npm run smoke` — Chrome browser scenarios against the running dev server (typed-instruction wrench solution, clarification, objectives toggle, 9:16 frame).
- `BROWSER_CHANNEL=msedge npm run smoke` — the same tests in installed desktop Edge.
- `SMOKE_URL=http://127.0.0.1:4173 SMOKE_PRODUCTION=1 npm run smoke` — the same scenarios against the production build.

There is no developer console anymore; the scripted presets in `src/game/presets.ts` remain as test fixtures only. Restart is available from the end-of-call card. Switching away from the browser tab pauses the session; resume from the overlay when returning.

## What is implemented

- Sequential structured actions, phone selfie/rear cameras, Grandma-relative and camera-relative directions, procedural Grandma, room interactions, reaching, posture and hands.
- Three complete solutions: close valve, wrench repair, patch secured by clamp. Both patch steps require the phone on the dry shelf and a spare hand.
- Five minutes to flooding with no intervention. One-use towels and bucket add at most 24 and 36 seconds at the initial leak rate; they cannot solve the leak.
- Seeded stress-dependent ambiguity (15/30/45%). Precise instructions have no random interpretation failures. Unclear targets/directions return structured clarification results.
- Cancellation at safe points, pause/resume, full reset, stale-run rejection, progress/results/terminal events and a bounded queue.
- A typed-instruction placeholder for the voice agent, with a call transcript showing Grandma’s results, clarifications and misunderstandings.

## Team handoff

**Jeff owns creative assets and presentation. Yao owns voice AI.** The game layer owns simulation, action execution, phone behavior, and the integration contracts. [Team work areas and next integration steps](docs/TEAM.md).

| Owner | Entry point |
| --- | --- |
| Yao · Voice AI | [Integration guide](docs/INTEGRATION.md), `src/game/index.ts`, `gameCommands`, `ACTION_REQUEST_SCHEMA` |
| Jeff · Creative | [Creative handoff](docs/CREATIVE.md), `src/creative/visuals.ts`, `src/view/presentation.ts` |
| Game simulation | `src/game/controller.ts`, `src/game/config.ts` |
| Hackathon alignment | [Reviewed starter guidance](docs/HACKATHON.md) |
| Validation | [Checks and remaining browser verification](docs/VALIDATION.md) |

No voice SDK, microphone capture, natural-language parser, generated speech, voice clone, API credentials, external models, fonts, images, or sound assets are included. These are deliberately separate teammate responsibilities. Everything visible is procedural geometry and system typography, and the game runs without network calls after installation.

The command-session bridge accepts the structured actions produced by Yao’s interpreter. It handles same-run interruptions, stale AI responses, duplicate delivery, and ordered sequences that stop at the first issue. The typed-instruction placeholder uses this bridge too, so a new line typed mid-sequence interrupts Grandma the same way barge-in speech will. The simulation advances in fixed 50 ms steps, independent of browser frame rate.

The custom React 19 + React Three Fiber 9 setup follows the [renderer’s compatibility guidance](https://r3f.docs.pmnd.rs/getting-started/installation). This is a standalone app, outside the starter repo’s `game-kit/` folder. See the hackathon notes for why the starter’s folder-specific JavaScript engine rules do not require a stack change here.
# help-me-grandma
