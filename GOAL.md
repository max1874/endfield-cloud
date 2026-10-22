# Goal: full automation suite

Requested by Max on 2026-10-21. Every session working in this repository reads this
file first and updates the ledger at the bottom when a status changes.

## Outcome

One click in the app runs the selected daily/weekly chores of 云·终末地 unattended,
with the window covered, and leaves for each task a record that proves the game
changed (see "Essential variable" in `AGENTS.md`). Scope is every in-game task
MaaEnd automates **except map/field collection and anything that needs walking or
driving in the open world** (listed under Excluded). MaaEnd stays reference only.

## Done means

A task is done only when all of these hold:

1. It ran in the real app against the live cloud game, started from the world or
   menu, with the window covered.
2. Its run directory holds before/after frames of the state it changes, the change
   the engine recognized (numbers reconciled where the screen shows numbers), and a
   verdict that agrees with the frames.
3. Its failure path was seen at least once: a state it cannot handle ends as
   `unknown`/`blocked` with frames, never as `passed`, and the game is left on a
   known screen (world or menu).
4. A task that spends anything obeys the spending policy below; a run that would
   break it stops as `blocked` before the spend.

A task whose state is already consumed today (daily reset 04:00 server time, weekly
reset Monday 04:00) waits in the ledger with its next verifiable time; it is not done.

## Phase 0 — operation foundation

| ID | Capability | Done when |
|----|-----------|-----------|
| E1 | Session lifecycle: start (开始游戏, retry 火速处理中/排队超时), title → world, exit session | 3 consecutive cold starts reach the world with no manual step |
| E2 | Input layer: hotkeys, click with cursor parking, Alt+click HUD, drag with deltas, scrollbar scroll; each action has pre/post condition, timeout, safe/unsafe retry | each primitive observed changing the screen; an unsafe action is never retried blindly |
| E3 | Recognition: screen fingerprints (ROI OCR, templates captured from our stream, color anchors, forbidden anchors, `unknown`), number OCR with reconciliation, stability wait | fingerprints for world, menu and every screen a task touches; replay of saved frames classifies them correctly |
| E4 | Navigation: from any known screen back to world/menu; open screens by hotkey or menu; 帝江号 teleport via map; dismiss common popups | round trips to each task's entry screen pass, including from a popup |
| E5 | Runner and UI: task list with options in the app, sequential run, per-task artifacts and run summary, viewport check, stop on real input | a multi-task run produces one summary linking each task's evidence; real input stops it (needs Max for the real input) |

## Phases 1–4 — tasks

Order follows value and dependency. MaaEnd name in brackets for reference.

**Phase 1, daily core**
- 基建 [DijiangRewards]: 快速收取, 制造舱 收取/补货/生产助力, 培养舱 收取/再次培养, 恢复心情, 会客室 线索 (last)
- 日常奖励领取 [DailyRewards]
- 简制手册领取 [ReceiveProdManual]
- 据点交易 [OutpostTrading] — earns 调度券
- 弹性物资囤货 [AutoStockpile] — spends 调度券
- 资源回收站 [ResourceRecycleStation]
- 模拟空间奖励 [ClaimSimulationRewards]

**Phase 2, daily extra**
- 信用点购物 [CreditShopping] — spends 信用点
- 拜访好友 生产助力/情报交流 [VisitFriends]
- 生态农场 via map [AutoEcoFarm]
- 转交委托, modes without auto-delivery [DeliveryJobs]
- 赠送干员礼物 [GiftOperator] — spends a gift
- 简易制作 [Crafting] — spends materials

**Phase 3, weekly and on demand**
- 稳定物资 weekly [AutoStockStaple] — spends 调度券
- 存放背包 [StashBackpack], 库存转移 [ItemTransfer], 切换编队 [SwitchTeam]
- 装备制造 [GearAssembly], 升级武器 [WeaponUpgrade], 分解武器基质 [DecomposeWeaponEssence], 基质筛选锁定 [EssenceFilter], 批量简易制作 [SimpleProductionBatchStart]
- 百科已读 [ReadAllWiki], 会话消息 [BakerEntry], 批量删除好友 [BatchDeleteFriends], 抽数计算 [PullCountCalculator], 批量探测器 [BatchUseDetector]

**Phase 4, combat (hardest; needs an auto-fight loop)**
- 协议空间 [ProtocolSpace] — spends 理智
- 选剑演武 [TrialOfSwordmancy]
- 基质刷取 [AutoEssence]

## Excluded

- Map/field collection and open-world movement: AutoCollect, EnvironmentMonitoring,
  SeizeDeliveryJobs, DeliveryJobs auto-delivery mode, AutoSell (walks on a friend's
  ship), ZiplineImport, SharedZiplineDelete.
- Other platforms' launch/close: AndroidOpenGame, CloseGame, CloseGamePC,
  LaunchGameLinux (E1 replaces them), AccountSwitch (cloud login differs).
- Dev/test and expired: DevTest, AdbAutoFightTest, WebEvent202605.
- Agreed with Max (2026-10-22): RealTimeTask (real-time combat assist), PuzzleSolver and
  AeroSalvage (minigames), BatchAddFriends (risk control), ImportBluePrints,
  IntelArchive (external site).

## Standing constraints

- No local test/check suites; verification is the running product. Corpus replay
  belongs in CI, and adding a CI workflow needs Max's explicit ask.
- In-game spending (Max, 2026-10-22): tasks may spend 调度券, 理智, 信用点, materials
  and gifts without asking. Never spend 衍质源石 or 嵌晶玉: the input layer refuses
  to confirm any dialog or purchase that shows either, and the task ends `blocked`.
- 据点交易 (selling goods for 调度券) keeps at least 100 of every goods item; it
  sells only the amount above 100.
- Never drag item contents (warehouse/backpack); never delete, decompose or sell
  anything Max has not configured.
- If Max plays and consumes a daily state, that task waits for the next reset.

## Ledger

| Item | Status | Evidence / next check |
|------|--------|-----------------------|
| Spike 1 viewport lock | done | `artifacts/acceptance-20261021-viewport/`, commit 919fe19 |
| Spike 2 input survey | done | `AGENTS.md` "Input facts"; real-input stop unverified |
| Spike 3 capture/OCR timing | done | `AGENTS.md` "Input facts" |
| Spike 4 template/number OCR robustness | not started | |
| Engine core (JS in isolated world, OCR bridge, evidence, runner) | in-app selftest passed | run `20261021-164204-66t1` (title → world → menu → settings → world), screen locked, session already streaming |
| E1 session start/exit | done | bundled build run `20261022-095446-2ntl` passed; 3 consecutive cold starts (cooldown retry included) → title → 月卡 notice/world → selftest passed → session exited: runs `20261022-093105-tn6j`, `-093208-aqib`, `-093330-ly2e`; failure path seen (`nav_world_timeout`, `session_start_timeout`) |
| E1 unattended with displays asleep | out of scope | Max (2026-10-22): runs happen with the display on; neither keeping the app open nor waking the display is wanted |
| E2 input layer | partial | key, click with deltas, Alt+click, drag implemented; Alt+click and drag not yet exercised through the engine |
| E3 recognition | partial | world/menu/settings/title/loading/boot/总控中枢/获得奖励 fingerprints; ESC-label template; item counts via `E.readNumber` (digits mode) verified on two reward frames; NCC matching untested on varied frames |
| E4 navigation | partial | nav to world from boot splash/title/月卡 notice/menu/settings observed |
| E5 runner/UI | partial | menu run/stop, per-task evidence, summary; no task options UI, no scheduler |
| 基建 快速收取 (`dijiang_collect`: 总控事项 产物 + 线索) | partial | 线索 collected by the task live (run `20261022-095929-5qlz`; it recorded 信用 9 for a tile showing 60, fixed in native OCR, replay of both reward frames now reads 60 and 2/2/3/2/24 three times out of three); 产物 flow done by hand once at 09:57 (3 cabins collected); `nothing_to_do` seen live (`20261022-100330-nwju`). Next: 产物 through the task once products accumulate |
| 日常奖励 · 行动手册日常 (`daily_tasks`) | partial | flow seen by hand 2026-10-22 10:05 (one 领取 claimed 2 rows, 活跃度 0 → 40; milestone 20 claimed 20+40 together, 获得奖励); task's `nothing_to_do` live with 活跃度 read 40 (`20261022-100757-v6t5`). Next: claim path through the task after the 04:00 reset |
| 日常奖励 · 邮件 (`mail_claim`) | partial | `nothing_to_do` live (`20261022-100935-uu8k`); claim path waits for mail with attachments |
| 日常奖励 · 转交委托/通行证/活动 | not started | |
| 简制手册 (`prod_manual`) | partial | navigation 背包 → 简易制作 → 简制手册 → first item and back observed; `nothing_to_do` live (`20261022-101138-xr9z`); 一键领取 path (from MaaEnd's flow) not yet seen on our stream |
| Other Phase 1–4 tasks | not started | |
