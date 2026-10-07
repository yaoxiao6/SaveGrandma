# Team work areas

| Owner | Owns | Primary files |
| --- | --- | --- |
| Game development (this workspace) | Simulation, action rules, timing, cancellation, camera pose, controller contracts, call UI, regression tests | `src/game/`, `src/view/presentation.ts`, `src/App.tsx` |
| Jeff | Models, materials, authored animation, room presentation, visual effects, sound design and final styling | `src/creative/visuals.ts`, new creative components/assets, `src/styles.css` |
| Yao | Microphone/STT, language interpretation, conversational responses, Fish Audio integration, audio playback, voice consent and server credentials | New voice adapter/server; imports from `src/game/index.ts`; replaces the placeholder in `src/voice/text-commands.ts` |

This division does not require a particular voice SDK or asset toolchain. Coordinate changes to `types.ts`, `config.ts` and the shared presentation contract with the game owner, since these affect both integrations.

## Yao: first integration

1. Read [INTEGRATION.md](INTEGRATION.md) and the [hackathon notes](HACKATHON.md).
2. Import `gameController` for observations/lifecycle and `gameCommands` for spoken instruction execution. Export or adapt `ACTION_REQUEST_SCHEMA` to the interpreter’s tool format. No natural-language parsing lives in the game.
3. At speech onset, call `beginTurn()`. Forward its abort signal to pending AI work; capture its token through all async stages. On interruption, stop your audio and interrupt game commands together.
4. Submit only the steps the player requested. Use results to decide dialogue; a failed step stops the rest of that compound request.
5. `App.tsx` currently has a typed-text composer and a disabled microphone button as a placeholder. The `send` handler there shows the exact call sequence (`beginTurn` → interpret → `submit`); swap the keyword matcher in `src/voice/text-commands.ts` for your interpreter and wire the mic button. The transcript already renders results, clarifications and misunderstandings. Keep keys server-side.

Acceptance: speak the wrench solution end-to-end; interrupt during movement; let a deliberately delayed old response arrive; confirm it does not execute. Reset during interpretation and repeat. Voice choice and actual audio validation remain Yao’s work.

## Jeff: first integration

1. Read [CREATIVE.md](CREATIVE.md).
2. Add components in `src/creative/` and register whichever are ready in `SCENE_VISUALS`: `Grandma`, `Environment`, `Tool`. Unregistered slots retain the placeholders. Use known asset licenses and record provenance next to added files.
3. Animate from `SceneFrame.character.animation`; attach objects from `character.hands`; use `anchors` and `effects` for room state. The root position/yaw and phone camera stay controlled by the game.
4. Run the wrench preset and the wrong-tool preset; check toolbox lids opening, tools appearing, cancelled interactions, bent posture and pause behavior.

Acceptance: a new model or animation changes presentation without changing action timing, object identity, reach, hand checks or solution outcomes. Authored clips, asset loading, lip sync and audio are not implemented by the placeholder render layer.

## Current milestone

- Bathroom simulation and the portrait call UI are working under automated tests; typed instructions stand in for voice.
- Same-run voice turn cancellation, abort signals, duplicate-delivery handling and safe compound execution are available.
- Camera pose and animation cues have a shared, tested render contract and optional component slots.
- Seeded scenarios remain runnable without either teammate’s assets or services.
- Desktop Chrome/Edge visual/performance checks remain pending because of the execution environment; see [VALIDATION.md](VALIDATION.md).

Nothing here sends messages to teammates, provisions a provider account, or publishes a deployment.
