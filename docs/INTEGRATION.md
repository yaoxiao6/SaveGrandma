# Voice integration contract

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

Events are delivered synchronously after a controller mutation completes, including queue acceptance events before `submitAction` returns. Do not rely on registering a result listener after submission. Listener-triggered controller calls are supported; filter events by the captured run ID. Listener exceptions are isolated and reported to the console. Observations, requests, and emitted events are copied so consumers cannot mutate the simulation.

## Actions

| Type | Fields and meaning |
| --- | --- |
| `look` | `direction: forward/backward/left/right/up/down`, optional `degrees` (1–180; default 35), optional `frame` |
| `turn` | `direction: left/right`, optional `degrees` (1–180; default 90), optional `frame`; turns Grandma’s body |
| `move` | `direction: forward/backward/left/right`, `meters: 0.1–5`, optional `frame`; requires standing and a clear path |
| `move_to` | `target`; walks directly to within reach, faces the approach direction; blocked straight paths fail, no pathfinding |
| `switch_camera` | `mode: selfie/rear` |
| `place_phone` | `target: { id: 'dry_spot' }`; requires shelf reach and standing |
| `retrieve_phone` | requires shelf reach, standing, a free hand |
| `bend`, `stand` | changes posture; never implicit in other actions |
| `grab` | `target`; one free hand and correct posture required |
| `place` | `item`, `target: dry_spot/puddle`; uses held item, towels/bucket at puddle provide bounded mitigation |
| `rotate` | `target`, `direction: clockwise/counterclockwise`; omission asks for clarification |
| `apply_patch`, `secure_patch` | `target: { id: 'pipe_joint' }`; two hands, appropriate item, bend, reach; clamp requires applied patch |
| `wait` | `seconds: 0.1–600`; water keeps rising |

All directional actions default to `frame: 'grandma'`. At yaw 0 Grandma faces +Z; her left is +X. Camera-relative movement uses the active lens’s horizontal forward axis. The selfie lens points opposite the rear lens, so `move forward` in the selfie camera frame moves behind Grandma. `turn` with the camera frame turns Grandma to the lens heading plus the requested signed angle. A shelf-mounted camera’s frame stays fixed even as she turns or moves.

Horizontal `look` in Grandma’s frame aims relative to her body; repeated `look left` is not cumulative. `look` in the camera frame changes the lens’s current heading. Up/down change pitch, capped at ±65°. Forward resets pitch. Camera-relative aiming requires the phone held; Grandma can still look around while it is placed. Switching lenses changes the view but never teleports the phone.

## Targets and ambiguity

```ts
// Precise: no random interpretation failure.
{ runId, action: { type: 'rotate', target: { id: 'supply_valve' }, direction: 'clockwise' } }

// Description lookup uses an authored vocabulary, not natural-language parsing.
{ runId, action: { type: 'rotate', target: { description: 'fitting' }, direction: 'clockwise' }, unresolved: ['target'] }

// A color qualifier can make that same instruction unambiguous.
{ runId, action: { type: 'rotate', target: { description: 'fitting', qualifiers: { color: 'red' } }, direction: 'clockwise' } }

// The teammate can explicitly supply plausible reference candidates.
{ runId, action: { type: 'grab', target: { candidates: ['wrench', 'clamp'] } }, unresolved: ['target'] }
```

IDs: `supply_valve`, `pipe_joint`, `wrench`, `patch`, `clamp`, `towels`, `bucket`, `dry_spot`, `puddle`.

Example exact description aliases: `valve`, `red valve`, `joint`, `pipe`, `fitting` (valve/joint), `tool` (wrench/clamp), `towels`, `bucket`, `patch`, `shelf`, `water`. Unsupported descriptions ask for clarification. The voice teammate normalizes language to IDs or these aliases. Qualifiers currently support `color` only; use `unresolved` for remaining details. An explicit ID takes precedence over a description/candidate list; a contradictory color asks for clarification.

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
