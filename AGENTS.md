# endfield-cloud

A macOS client for the official cloud version of Arknights: Endfield (云·终末地),
built on Tauri + WKWebView, with our own automation engine that reads the video
stream and drives the game through in-page input.

## Essential variable

A task succeeds only when the game itself shows the intended change. Every
automation task must end by saving, under the run's artifact directory:

- before/after frames of the in-game state the task is meant to change, and
- the change the engine recognized from those frames (for example
  "product X: 12 → 0 collected", "restocked"), next to the task's own verdict.

Acceptance is read from that record. "The flow ran to the end", a log line
saying "passed", a build, or a screenshot of an unrelated screen does not count.
A task that cannot produce the record is not done.

## MaaEnd is reference only

`~/Projects/Repo/endfield` is MaaEnd (AGPL-3.0). Read it to understand game flows,
UI strings and failure cases. Do not copy its code, pipeline JSON, images,
coordinates or ROIs into this repository, and do not run it as a dependency.
Recognition templates are captured from our own stream.

## Runtime

- Build and run: `scripts/build-app.sh`, then `scripts/run-app.sh` (the runtime
  log goes to `artifacts/runtime-*.log`; page errors and WebRTC state appear there
  prefixed with `page`).
- Automation runs while the window is covered or inactive. Real user input inside
  the game stops it; never reintroduce a focus requirement.
- The game window loads only `https://endfield.hypergryph.com/cloud`. Native
  bridges check that origin before acting.
- Server-side conditions that are not our bugs: "上一局数据正在火速处理中" for about
  a minute after a session ends, and occasional "排队超时". Retry; do not treat
  them as client failures.
- Debug builds poll `~/Library/Application Support/local.endfield.cloud.prototype/dev-inbox/`:
  `NAME.js` runs in the game page as an async function body and its result lands in
  `dev-outbox/NAME.json` (or `NAME.png` for a PNG data URL). Use it to drive input
  and recognition experiments from a shell. Release builds never poll the inbox.

## Coordinate space

The cloud SDK asks the server for a game resolution of the page viewport times
`devicePixelRatio` and resends it on every resize, so the game's layout follows
our window. `native/viewport.m` fixes the page viewport at 1280×720 (window not
resizable); on a 2× display the stream is 1920×1080. Recognition coordinates are
normalized to that 16:9 frame. Anything that changes the viewport (fullscreen)
changes the layout; automation must check the viewport before acting.

## Input facts (measured 2026-10-21, synthetic DOM events on `#WelinkGameVideo`)

- Hotkeys (M, B, C, J, F8, Esc) work; the screen starts changing about 200 ms after
  the key.
- Clicks work at absolute positions. In-world HUD buttons need Alt held (Alt down,
  click, Alt up); without Alt the click goes to the camera.
- `mousemove` is ignored unless `movementX`/`movementY` are non-zero. Hover and
  drags therefore need real deltas; a drag without them does nothing, and a slider
  then only jumps to where the press landed.
- The game cursor takes the event's absolute position. The main menu has a
  cursor parallax of up to ~50 px: park the cursor at a fixed point (one move with
  a non-zero delta) before recognizing or clicking positions in it. With the cursor
  parked, menu layout matched across sessions within 3 px.
- The mouse wheel reaches the SDK but does not scroll game lists. Scroll by
  dragging the list's scrollbar. Dragging list content in item UIs (warehouse,
  backpack) picks up an item and can move it between containers; never drag there.
- Capture costs at 1920×1080: draw ~0–1 ms, full `getImageData` ~1 ms, full PNG
  ~30 ms in-page (~45 ms to a native file). Vision OCR: full frame ~130 ms
  accurate / ~30 ms fast; a small ROI ~40 ms accurate. Prefer ROI OCR.
