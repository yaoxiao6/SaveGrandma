# Voice integration contract

**Owner: Yao.** The game supplies action/state contracts; Yao owns speech, interpretation, dialogue, Fish integration and playback.

## Recommended entry point: command sessions

The app now exports `gameCommands`, a provider-independent wrapper around the same controller. It solves sequencing and async turn ownership without implementing any voice service:

```ts
import {
  gameController as game,
  gameCommands,
  ACTION_REQUEST_SCHEMA,
  type CommandStep,
  type Observation,
} from '../src/game';

// Yao supplies this callback; no SDK is assumed by the game.
async function handleSpeech(
  interpret: (observation: Observation, signal: AbortSignal) => Promise<CommandStep[]>,
) {
  // Call at speech onset, not after the LLM response comes back.
  const turn = gameCommands.beginTurn();
  const steps = await interpret(game.getObservation(), turn.signal);
  return gameCommands.submit(turn.token, steps);
}

// On stop/disconnect: also stop the adapter's current audio playback.
gameCommands.interrupt();

// Use this as an input-shape reference or adapt it to your provider's tool format.
console.log(JSON.stringify(ACTION_REQUEST_SCHEMA));
```

Each step is `{ action, unresolved? }`, using the actions documented below. The turn token carries `runId` and `turnId`; keep it unchanged through your async pipeline. `beginTurn()` aborts the previous signal and clears game actions. Signals also abort on reset and terminal outcomes. Handle an aborted interpretation as an interruption, not a connection error; terminal narration can be started separately from the aborted gameplay turn.

`submit()` validates the entire sequence before starting any step, then submits one action at a time. It stops on a failed prerequisite, clarification, cancellation, `LEAK_WORSENED` or terminal outcome. It does not synthesize missing steps. The promise resolves to `{ runId, turnId, status, code, results, skipped, stage }`. `skipped` counts steps never submitted; `results` contains received controller results. A win can finish before all supplied steps, returning `TERMINAL` with the remaining count skipped.

Repeated delivery of an already-submitted live turn returns the original promise and never replays its actions; the first submitted payload wins. An older turn in the same run returns `STALE_TURN`, and an earlier run returns `STALE_RUN`. Run IDs also have a per-page-instance UUID so a reload cannot reuse a previous service request’s identifier. New submissions during pause are rejected, while a sequence already executing freezes and resumes with the game. If other code queues work between `beginTurn` and `submit`, the session rejects with `BUSY` instead of mixing instructions.

Use the app singleton for one game. `createCommandSession(controller)` is available for tests or a different host; dispose custom instances when finished. Do not dispose the app singleton during transient adapter disconnects—use `interrupt()` so reconnecting can reuse it.

`ACTION_REQUEST_SCHEMA` is ordinary JSON Schema, not an SDK-specific strict tool schema. The controller and session validate against the same definition with `isActionRequest`. Unknown fields and qualifiers are rejected instead of silently ignored. Optional fields remain optional: for example, omitting rotation direction produces a gameplay clarification. Providers with stricter schema restrictions can adapt the schema while preserving this contract. No parsing, provider credentials or network transport is supplied here.

`src/voice/text-commands.ts` is a typed-text placeholder that produces `CommandStep[]` from a keyword matcher so the loop is playable before speech exists; `App.tsx` shows how it is wired. Replace it rather than extend it.

The original low-level controller below remains supported. Its raw queue intentionally does not stop automatically after errors; prefer `gameCommands` for spoken compound instructions.

Import the app’s singleton, not a second simulation:

```ts
import { gameController as game, type ActionRequest, type GameEvent } from '../src/game';
```

The browser owns simulation time. `App.tsx` advances it every 50 ms, at normal speed outside development. The voice adapter must not call `advance`, read internal state, or implement its own action effects. For a separate host or automated test, `createGame(seed)` provides a new `{ controller, simulation }`; drive that simulation with elapsed seconds.

## Responsibilities and data flow

Microphone → teammate’s STT/interpretation service → structured action → browser controller → results/observations → teammate’s dialogue/TTS → audio playback. The Fish Audio key stays on the teammate’s server. This code has no provider imports or service URLs. Consult [hackathon notes](HACKATHON.md) before connecting Fish Audio.

Only `getObservation()` and `GameEvent` should be passed into conversational context. They omit repair flags, solution definitions, leak rates, RNG state, mitigation capacities and timing constants. `readState()`, `OBJECTS`, `TUNING` and `PRESETS` are engine/developer data. The public controller facade does not expose them.

`surroundings` describes objects Grandma can currently see in a 140° horizontal perception cone (also includes objects within 0.6 m). This is Grandma’s perception, not a machine-vision description of the phone image. A placed phone can show a different view from what Grandma sees. Geometry occlusion is not modeled in this placeholder scene. Objects carry stable IDs, human labels, colors, distance and reachability; no suggested solution actions are attached. Explicit IDs can refer to previously seen objects, but reach/posture still apply.

## Lifecycle and asynchronous work

1. Subscribe before starting or submitting. The call’s UI invokes `start()` after the user answers; it is also safe to call it yourself while `stage === 'ready'`.
2. Capture `runId` from the observation **when the voice turn starts**, before async STT/LLM work. Preserve that ID in the resulting request. Do not replace it with a fresh ID when a delayed response arrives.
3. `submitAction` synchronously returns `{ accepted, actionId, runId, code, message }`. Acceptance means queued, not executed. Request structure/lifecycle/run checks happen immediately; reach, tools, target interpretation and other world-dependent checks happen when that action reaches the front.
4. Wait for `action_result` before claiming success. `action_progress` begins at 0 and reports progress while active. On completion there is a result rather than a required progress=1 event.
5. On interruption, call `cancelActions()` and stop the teammate’s audio/LLM response. It clears queued actions and interrupts active work at the current tick boundary. Walking retains distance traveled; other unfinished actions have no committed effects. Completed actions persist.
6. `pause()` freezes water and actions; `resume()` resumes. Submission is rejected during pause, ready, win, or loss. Hidden browser tabs automatically pause and require an explicit resume.
7. `reset({ seed: 7 })` cancels old work and creates a new `runId`, returning to ready. Discard old dialogue/audio and pending voice turns. Cancellation events retain the old run ID. Seed resets reproduce interpretation randomness.
8. On `terminal`, stop accepting gameplay for that run and let the UI show the outcome. Reset is required for a new run. Unsubscribe on adapter disposal.

Events are delivered synchronously after a controller mutation completes, including queue acceptance events before `submitAction` returns. Action results are flushed between fixed simulation ticks so listeners can cancel the next step even during a long clock advance. Do not rely on registering a result listener after submission. Listener-triggered controller calls are supported; filter events by the captured run ID. Listener exceptions are isolated and reported to the console. Observations, requests, and emitted events are copied so consumers cannot mutate the simulation.

## Actions

| Type | Fields and meaning |
| --- | --- |
| `look` | `direction: forward/backward/left/right/up/down`, optional `degrees` (1–180; default 35), optional `frame` |
| `turn` | `direction: left/right`, optional `degrees` (1–180; default 90), optional `frame`; turns Grandma’s body |
| `move` | `direction: forward/backward/left/right`, `meters: 0.1–5`, optional `frame`; requires standing and a clear path |
| `move_to` | `target`; walks directly to within reach, faces the approach direction; blocked straight paths fail, no pathfinding |
| `switch_camera` | `mode: selfie/rear`; when placed, requires standing within reach of the phone shelf |
| `place_phone` | `target: { id: 'dry_spot' }`; requires shelf reach and standing |
| `retrieve_phone` | requires shelf reach, standing, a free hand |
| `bend`, `stand` | changes posture; never implicit in other actions |
| `grab` | `target`; one free hand and correct posture required |
| `place` | `item`, `target: dry_spot/puddle`; uses held item, towels/bucket at puddle provide bounded mitigation |
| `rotate` | `target: { id: 'pipe_joint' }`, `direction: clockwise/counterclockwise`; needs the wrench in hand; omission asks for clarification |
| `open` | `target`: one of the three toolboxes; reveals the tool inside (`NOT_FOUND` explains a tool that is still shut away) |
| `wait` | `seconds: 0.1–600`; water keeps rising |

All directional actions default to `frame: 'grandma'`. At yaw 0 Grandma faces +Z; her left is +X. Camera-relative movement uses the active lens’s horizontal forward axis. The selfie lens points opposite the rear lens, so `move forward` in the selfie camera frame moves behind Grandma. `turn` with the camera frame turns Grandma to the lens heading plus the requested signed angle. A shelf-mounted camera’s frame stays fixed even as she turns or moves.

Horizontal `look` in Grandma’s frame aims relative to her body; repeated `look left` is not cumulative. `look` in the camera frame changes the lens’s current heading. Up/down change pitch, capped at ±65°. Camera-relative up raises the active lens, including selfie; Grandma-relative up raises the phone’s rear direction, with the front lens pointing oppositely. Forward resets pitch. Camera-relative aiming requires the phone held; Grandma can still look around while it is placed. Switching lenses changes the view but never teleports the phone.

## Targets and ambiguity

```ts
// Precise: no random interpretation failure.
{ runId, action: { type: 'open', target: { id: 'red_toolbox' } } }

// Description lookup uses an authored vocabulary, not natural-language parsing.
{ runId, action: { type: 'rotate', target: { description: 'fitting' }, direction: 'clockwise' }, unresolved: ['target'] }

// A color qualifier can make that same instruction unambiguous.
{ runId, action: { type: 'rotate', target: { description: 'fitting', qualifiers: { color: 'red' } }, direction: 'clockwise' } }

// The teammate can explicitly supply plausible reference candidates.
{ runId, action: { type: 'grab', target: { candidates: ['wrench', 'hammer'] } }, unresolved: ['target'] }
```

IDs: `pipe_joint`, `red_toolbox`, `blue_toolbox`, `green_toolbox`, `wrench`, `screwdriver`, `hammer`, `towels`, `bucket`, `dry_spot`, `puddle`. The three tools are dealt into the three toolboxes per seed; a tool only appears in `surroundings` once its box is open.

Example exact description aliases: `pipe`, `red pipe`, `joint`, `fitting`, `toolbox`/`box` (any of the three; add a color qualifier), `tool` (wrench/screwdriver/hammer), `towels`, `bucket`, `shelf`, `water`. Unsupported descriptions ask for clarification. The voice teammate normalizes language to IDs or these aliases. Qualifiers currently support `color` only; use `unresolved` for remaining details. An explicit ID takes precedence over a description/candidate list; a contradictory color asks for clarification.

Non-target unresolved fields, such as `direction`, always ask. Multiple visible plausible targets trigger a seeded stress check: 15% low, 30% medium, 45% high. A mistake chooses a candidate other than the nearest/context-primary target, emits `misunderstanding`, then undergoes normal prerequisite checks; it may fail or complete on that object. Otherwise the game asks which target was intended. One plausible candidate is reliable. No plausible candidate asks. A fully specified instruction is never randomly corrupted, including at high stress.

Broad goals such as `fix the pipe` are unsupported (`INVALID_REQUEST` for an unsupported action type). The game never selects a solution or silently fetches tools, walks, bends, or puts things down.

## Results and dialogue

```json
{
  "type": "action_result",
  "runId": "run-3",
  "result": {
    "actionId": "run-3:action-12",
    "runId": "run-3",
    "status": "failed",
    "code": "MISSING_TOOL",
    "message": "Pick up the wrench before turning the brass joint.",
    "targetId": "pipe_joint"
  }
}
```

Statuses: `completed`, `failed`, `clarification_needed`, `cancelled`. Reason codes are a TypeScript union in `types.ts`. Useful dialogue cases: `OUT_OF_REACH`, `WRONG_POSTURE`, `HANDS_FULL`, `MISSING_TOOL`, `PHONE_MUST_BE_PLACED`, `PATCH_REQUIRED`, `CLARIFICATION_NEEDED`, `LEAK_WORSENED`. A wrong explicit rotation is a **completed action** with `LEAK_WORSENED`, not a parser failure. The text is developer feedback; the voice teammate owns Grandma’s actual phrasing.

Compound requests become ordered submissions. Failures do not automatically cancel later actions. For condition-dependent voice sequences, submit one step at a time or cancel remaining work on a failed/clarification result. Queue capacity is 64 pending actions.

## Scripted end-to-end solution

```ts
import { gameController as game, type Action } from '../src/game';

game.reset({ seed: 7 });
game.start();
const runId = game.getObservation().runId;
const script: Action[] = [
  { type: 'switch_camera', mode: 'rear' },
  { type: 'move_to', target: { id: 'wrench' } },
  { type: 'grab', target: { id: 'wrench' } },
  { type: 'move_to', target: { id: 'pipe_joint' } },
  { type: 'bend' },
  { type: 'rotate', target: { id: 'pipe_joint' }, direction: 'clockwise' },
];
const unsubscribe = game.subscribe(event => {
  if (event.runId !== runId) return;
  if (event.type === 'action_result' && event.result.status !== 'completed') {
    game.cancelActions();
    // Let the voice adapter ask the player what to do next.
  }
  if (event.type === 'terminal') {
    console.log(event.outcome, event.message);
    unsubscribe();
  }
});
for (const action of script) {
  const accepted = game.submitAction({ runId, action });
  if (!accepted.accepted) { game.cancelActions(); unsubscribe(); break; }
}
```

The developer scripts in `presets.ts` demonstrate the other solutions using the same facade. Do not import them into voice inference or the player UI.
