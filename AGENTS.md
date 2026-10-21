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
