# Validation

## Automated simulation

Final implementation check: all **39 tests passed**, TypeScript passed, and Vite produced the production build. Dependency installation reported **0 vulnerabilities** after updating the test runner. The available Node 23 runtime ran the checks successfully but is outside Vitest’s declared engine range; `.nvmrc` selects the recommended Node 22 LTS for teammates.

`npm run check` runs strict TypeScript checks and deterministic tests through the public controller facade. Coverage includes all three repair solutions, five-minute flooding, bounded towels/bucket, wrong rotations, tools, posture, reach, hands, blocked paths, patch order, seeded ambiguity, explicit qualifiers, clarification, reliable precise instructions at every stress band, phone placement/retrieval, reference frames, sequential work, cancellation, pause/resume, reset, stale requests, subscriber ownership and terminal events.

`npm run build` verifies the production bundle. The developer component is guarded by `import.meta.env.DEV`, and the production smoke script checks that its strings/presets are absent from built JavaScript.

## Desktop browser smoke test

With `npm run dev` running:

```sh
npm run smoke
BROWSER_CHANNEL=msedge npm run smoke
```

Requires locally installed Chrome/Edge and permission to launch those browser processes. The script drives the actual UI: answer, switch camera, run all solutions and flooding, reset, pause/resume, inspect the developer map, resize to a narrow viewport. It checks console/network errors and horizontal overflow, captures screenshots, and measures median/p95 frame intervals. Outputs live in ignored `artifacts/`.

With `npm run preview` running after a production build:

```sh
SMOKE_URL=http://127.0.0.1:4173 SMOKE_PRODUCTION=1 npm run smoke
```

## Environment limitations for this implementation run

The automated Chrome launch was attempted but the execution sandbox terminated the browser with `SIGABRT` and reported an `EPERM` process error before a page could load. No screenshot or browser performance measurement was produced. Desktop Edge is not installed in this environment. Chrome/Edge interaction, screenshot review and measured frame performance are therefore **not verified here**; the scripts above are supplied for a browser-capable environment. No unsupported claim of desktop browser verification is implied by passing the simulation tests.

## Manual checks after browser access is available

- Front camera shows Grandma; rear camera shares the phone position and shows the room.
- Set phone on shelf, walk away and turn: camera stays fixed. Retrieve only within reach.
- Apply-patch/clamp preset shows Grandma moving and bending while the phone stays on shelf.
- Inspect tool visibility, interaction framing, water plane and terminal overlays at 1440×1100 and 390×844.
- Confirm developer controls do not appear in production; voice adapter can drive the singleton through imports.
- Repeat voice-driven actions in Chrome and Edge after the teammate connects audio; credentials, microphone and Fish services are outside this validation scope.

Placeholder simplifications: no occlusion-aware perception, no general pathfinding, no character collision with the decorative trolley/shelf, no final animation clips or audio. Room bounds and the toilet are collision checked. No saved game, backend, or network synchronization is needed for this single-session demo.
