# TODO

Shared by every agent and session (Claude Code, Codex). Read it when resuming work
here, after a daily reset, and before reporting related work done. Follow-ups name
their trigger, check and done condition; backlog items wait for Max to pick them.
Delete an item once done. Task status itself lives in the `GOAL.md` ledger.

## Follow-ups

### macOS 27 fixes from run 20261029-203335-p99c — added 2026-10-29

- **Trigger:** the next 每日全部 run on macOS 27 with these fixes (William's account; run
  `20261029-203335-p99c` on v0.2.7: 7 of 11 tasks failed or timed out).
- **Fixed offline, not yet seen live:** menu fingerprint (干员 read as 千员, right column
  unread → 据点交易 timeout); 信用购物 name from a crop + one-glyph tolerance (棱/楼);
  线索 stock "1" from the 自有库存 line; 日常 tab by its fill and position (read as ■常);
  生态农场 from the 帝江号 map via its region card; kiosk sweep south of the doorway;
  弹性物资 card click retried once, 1xxx prices that may be xxx read from the dialog.
- **Check:** each task's verdict and frames; `*-click-missed` and `daily-tab-not-selected`
  frames if they appear; the 武陵 market note listing dialog-read prices.
- **Done when:** each of these tasks passes or is nothing_to_do once on macOS 27, or a
  remaining failure gets its own item.

### Tester rerun on macOS 27 — added 2026-10-27

- **Trigger:** Max authorizes sending v0.2.4 (or later) to the macOS 27 tester, whose run
  `20261026-210309-2ptr` (macOS 27.0.1; copy in `artifacts/tester-macos27-20261026/`)
  failed 9 of 10 tasks.
- **Seen on Max's Mac with the tester's account (2026-10-27, macOS 26.7):** runs
  `20261027-115141-e6ci`, `20261027-143022-82cs`, `20261027-162543-18ze`: 确定,
  确认, 一键领取, 0% 信赖度 gifts, 8 outposts, 武陵 stock purchase, mail, 日常
  0 → 100 passed. What only his machine shows is macOS 27's Vision OCR.
- **Check:** his next 每日全部 run directory, every task's verdict and frames.
- **Done when:** his run ends with every task passed or nothing_to_do, or each
  remaining failure has its own item.

### 生态农场 农植机 store loop through the task — added 2026-10-29

- **Trigger:** a v0.2.7+ run of `eco_farm` while a 自动农植机 (祀的画 or 武陵城)
  holds produce; it fills slowly (empty 40 minutes after being drained 2026-10-29).
- **Seen so far:** the loop only in probes (祀的画: 3 presses until empty); through
  the task, 牧场 stored once (`20261029-141245-1nrh`) and every 农植机 read empty.
- **Check:** the run's `*_farm-reward-N` frames and `*_farm-after` frame; the
  change record's `stored` total against the reward screens.
- **Done when:** a 农植机 is emptied through the task with frames that agree, or the
  failure gets its own item.

### Full daily run while minimized or hidden on v0.2.6 — added 2026-10-28

- **Trigger:** a 每日全部 run on v0.2.6 or later during which the window was
  minimized or the app hidden (run `20261028-104144-5lvi` on 0.2.5: presses took
  46-160 s instead of 3 s, 拜访好友 timed out and 赠送干员礼物 failed
  `anchor_panel_without_传送`).
- **Measured on 0.2.6 code (debug, app hidden in the world):** a cursor move
  1.7-2.1 s vs 15.7-17.7 s without the fix; menu open/close 2-3 s either way.
  A whole daily run hidden or minimized has not run; minimized was measured only
  in a standalone WKWebView.
- **Also seen 2026-10-28, cause unknown:** the hidden app became visible again during
  or at the end of a run; one start sat at the 标题 screen ignoring 37 clicks while
  hidden from launch; twice 开始游戏 got no response for 15 presses (once with
  6544 测速失败) and a page reload fixed it.
- **Check:** the run's per-press frame times (visit_friends `*-before`/`*-after`
  `videoTime`) and verdicts.
- **Done when:** such a run passes 拜访好友 with presses under about 10 s, or a
  failure gets its own item.

### Paths changed on 2026-10-27 that have not run live — added 2026-10-27

- **Trigger:** any 每日全部 run on v0.2.4 or later.
- **Check:** in the run's results:
  - `stockpile` after a real purchase: back to 当前拥有, the bought card found and
    reopened, owned/balance reconciled (run `20261027-162543-18ze` timed out there;
    nothing was sold). The 出售物资 → 购买 switch itself passed through `openCard`
    in a probe on Max's account, run `20261027-202705-dl3k`
    (`002-__-sell-side.png`, `003-__-buy-side.png`);
  - `operator_gifts` note "talk did not open (left?)" and the task going on;
  - `dijiang_collect` / `clue_exchange` note "I left the world open", a frame
    `nexus-unavailable-here`, the kiosk teleport and the 总控中枢 opening on the
    second I.
- **Done when:** each path is seen passing once, or fails with its own item.

### Contact kiosk prompt not found — added 2026-10-27

- **Trigger:** `operator_gifts` fails `kiosk_prompt_not_found` again (tester account,
  run `20261027-192412-3g3r`: minimap placed the player at (182,180), next to the kiosk,
  but the frame `000-kiosk-not-reached.png` shows a doorway with no prompt; the same
  account reached it in run `20261027-162543-18ze`).
- **Check:** the walk log (`operator_gifts walk …`) and the frame.
- **Done when:** the cause is known and the walk handles it.

### Browser error "The object is in an invalid state." — added 2026-10-27

- **Trigger:** a task fails with that summary (credit_shop, run
  `20261027-115141-e6ci`: every later frame grab in the page failed, so the run
  stopped). WebKit throws it when `getImageData` cannot read a canvas's pixels; a
  WKWebView probe holding 2000 frames (11 GB) did not reproduce it.
- **Check:** the task's notes now carry the error's stack (`1246b41`).
- **Done when:** the failing call and its cause are known and handled.

### Credit shop: the day's last refresh — added 2026-10-27

- **Trigger:** a 信用点购物 run that makes the day's last refresh (剩余次数 1/4 before).
- **Check:** after it the bar reads 今日刷新次数已用尽; `credit_shop` must record the
  refresh (refreshes 1 → 0) and go on buying, not fail `refreshes_1_after_…` as in
  run `20261027-102127-zbm2` (fixed in `47f791f`; only the "already used up at the
  start" reading was seen live, run `20261027-111711-s3cp`).
- **Done when:** a run records a 立即刷新 change with refreshes after 0.

### 总控中枢 not opening on I — added 2026-10-27

- **Trigger:** `dijiang_collect` or `clue_exchange` ends
  `expected_control_nexus_saw_world` again (Max's runs 2026-10-26 12:26 and
  2026-10-27 09:17, the tester's run; three later runs on 2026-10-27 opened it).
- **Check:** the end frame and the screen before I was pressed; both failing frames
  show the player in a red 激发 aura with an F 激发 prompt, and the tester's frame
  has no I among the HUD's key hints (T, Y, K). v0.2.4 teleports to the contact
  kiosk and presses I again (see "Paths changed on 2026-10-27").
- **Done when:** the cause is known and the task handles it.

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
