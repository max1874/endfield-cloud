# endfield-cloud

A macOS client for the official cloud version of Arknights: Endfield (云·终末地),
built on Tauri + WKWebView, with our own automation engine that reads the video
stream and drives the game through in-page input.

The current goal, its scope and its ledger are in `GOAL.md`; read it before working
and update its ledger when a status changes.

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
Recognition templates are captured from our own stream. One exception (Max,
2026-10-23, personal use only): MaaEnd's MapLocator floor plans may be copied
unchanged into `maps/`, each listed with its source in `maps/README.md`.

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
- Screen lock (2026-10-22): WebKit marks the page hidden while the screen is locked
  even with occlusion detection off, and the cloud page then refuses to start a
  session; `native/visibility.js` makes the page read itself as visible. A page
  instance that has never rendered since launch (displays asleep) gets no
  animation frames at all, so the home page's start flow stalls. An instance that
  rendered once keeps working after the displays sleep: on 2026-10-22 an instance
  launched at 09:08 (displays on) ran three cold start → selftest → exit cycles at
  09:31–09:34 with the displays off since 09:20, while an instance launched at 09:35
  with the displays off stalled at 开始游戏 with the same code. So unattended runs
  need the app opened while a display is on and kept open; waking the display is
  Max's decision (GOAL.md).
- Session controls on the page (verified from the engine world 2026-10-22): while a
  session connects, `#WelinkGameVideo` exists with `readyState` 0 and the home
  page's 开始游戏 stays laid out underneath; pressing it again then ends the new
  session and triggers the cooldown. The edge-docked 游戏菜单 slides in only on
  `pointerover`/`mouseover` (a bare `mouseenter` does nothing); 退出游戏 is a
  button with that aria-label inside it.
- After login the game may show full-screen notices that Esc does not close, such
  as the daily 月卡 reward ("点击确认今日月卡奖励"); navigation clicks their hint.
- Debug builds poll `~/Library/Application Support/local.endfield.cloud.prototype/dev-inbox/`:
  `NAME.js` runs in the game page as an async function body and its result lands in
  `dev-outbox/NAME.json` (or `NAME.png` for a PNG data URL). Use it to drive input
  and recognition experiments from a shell. Release builds never poll the inbox.

## Automation engine

- The engine is JavaScript in `native/engine/` (core, screens and navigation,
  session, runner, `tasks/*.js`), bundled with `templates/*.png` by `build.rs` and
  injected by `native/engine.m` into its own content world `endfield-engine`. It
  shares the DOM with the cloud page, so its events reach the SDK, while page
  scripts cannot reach it. Native code only provides OCR (Vision), evidence
  storage under `automation/<run>/<task>/` and logging (`engine …` in the runtime log).
- Menu 自动化 runs a task; Cmd+Shift+. stops it. In debug builds a dev-inbox script
  that starts with `//world:engine` runs in the engine world, which allows
  hot-loading a changed engine file before rebuilding.
- Templates are cropped from our own 1920×1080 frames, never from MaaEnd.
- Unattended runs: `window.__engine.run(ids, { session: true })` starts the cloud
  session, runs the tasks and exits the session.

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
