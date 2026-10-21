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
| E1 session start/exit | changed, unverified in engine | DOM presses verified from the page world 2026-10-22 00:40; engine `session.js` never completed a start (displays asleep, see AGENTS.md) |
| E1 unattended with displays asleep | blocked: needs Max | waking the display during runs is his call |
| E2 input layer | partial | key, click with deltas, Alt+click, drag implemented; Alt+click and drag not yet exercised through the engine |
| E3 recognition | partial | world/menu/settings/title/loading fingerprints; ESC-label template; NCC matching and number OCR untested on varied frames |
| E4 navigation | partial | nav to world from title/menu/settings observed |
| E5 runner/UI | partial | menu run/stop, per-task evidence, summary; no task options UI, no scheduler |
| Phase 1–4 tasks | not started | |
