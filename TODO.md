# TODO

Shared by every agent and session (Claude Code, Codex). Read it when resuming work
here, after a daily reset, and before reporting related work done. Follow-ups name
their trigger, check and done condition; backlog items wait for Max to pick them.
Delete an item once done. Task status itself lives in the `GOAL.md` ledger.

## Follow-ups

### Unverified paths after the next reset — added 2026-10-23

- **Trigger:** the next daily reset (04:00 server time) after 2026-10-23, with Max
  not playing.
- **Check:** build `02a94f8` or later, launch with a display on, click 自动化 →
  运行：每日全部 from the home page, then read `automation/<run>/summary.json` and
  each task's frames. Paths not yet seen live:
  - `dijiang_collect`: a second press on an entry that still opens 获得奖励;
  - `stockpile`: a price the 市场 list leaves unread, read from its 购买物资 dialog;
  - `operator_gifts`: a bundled-build run that gives gifts (the 2026-10-23 gifts
    were given by hot-loaded source; the bundled runs only hit the daily cap).
- **Done when:** one run ends with every task passed or nothing_to_do and the
  session exited, the GOAL.md ledger rows are updated, and no crash report
  (`~/Library/Logs/DiagnosticReports/endfield-cloud-prototype-*.ips`) appears.

### Run controls with a real mouse — added 2026-10-23

- **Trigger:** Max uses the app during a run.
- **Check:** click 接管 on the bar at the top of the page, then 继续; the menu path
  was verified in run `20261023-111742-vzyf`, the bar's own buttons were not.
- **Done when:** the log shows `run paused take_over` and `run continued` from the
  bar and the run finishes.

### Pointer lock with the window focused — added 2026-10-23

- **Trigger:** a session where Max has the app window focused (an agent cannot take
  focus: `activate` and `open` leave another app frontmost).
- **Check:** with the window focused and the game in the world, run 引擎自检 and one
  walking task (`operator_gifts`); before `f34b767` the engine's `exitPointerLock`
  reached the game as Escape and opened the menu.
- **Done when:** both pass with the window focused and no menu opens unasked.

### The 产物 entry that opens nothing — added 2026-10-23

- **Trigger:** 总控事项 lists 产物 and a press opens no 获得奖励 (`dijiang_collect`
  notes "a press opened no 获得奖励"; seen all day on 2026-10-23).
- **Check:** open the cabins by hand and find what holds the entry, likely a 制造舱
  or 培养舱 that needs restocking or input (Max: 制造舱补货 / 培养舱 are the game's
  auto buttons on the I screen).
- **Done when:** the cause is known and either handled by `dijiang_collect` or
  recorded in GOAL.md as out of scope.

## Backlog (ideas, 2026-10-23, waiting for Max to pick)

Suggested order: 1 → 3 → 2.

1. **Scheduled run with a report.** A time in the app (e.g. 04:30) starts 每日全部
   by itself; at the end a macOS notification ("9/10 done, 囤货 failed") opens a
   local report of the run: each task's verdict, before/after frames and numbers
   (信用, 调度券, 活跃度). Needs the app open and a display on (GOAL.md, E1).
2. **Spend the day's 理智.** Unused 理智 overflows every day. First check in game
   whether stages can be swept (扫荡 / 快速作战); if so, sweep a stage Max names
   without fighting, otherwise it is Phase 4 combat.
3. **Retry failed tasks once at the end of a run.** Most failures on 2026-10-23
   were timing (a dialog shown late, the menu still sliding in, a mid-scroll
   frame); tasks read the game's state before acting, so a second attempt is safe.
   A task that fails again is reported as before.
4. **Rules in a config file.** Outpost allowlists, the gift rule, clues kept, shop
   discount thresholds live in code; move them to a file (or a small settings
   page) Max can edit.
5. **Replay tests from failure frames.** Every failure left frames; turn them into
   recognition replay cases run in CI (e.g. the 619 vs 1619 price). Adding CI needs
   Max's explicit ask.
6. **Remaining scope.** Daily: 简易制作, 转交委托 / 通行证 / 活动 rewards. Weekly:
   weekly rewards and event shops (Phase 3).
