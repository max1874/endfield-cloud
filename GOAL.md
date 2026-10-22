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
  sells only the amount above 100. At every outpost it sells the goods with the
  largest stock first (更换货品), then the next, until the outpost's reserve runs
  out. 四号谷地 may sell only 精选荞愈胶囊 and 高容谷地电池 (Max, 2026-10-22).
- 弹性物资囤货 spends the whole daily purchase quota (剩余可购买数量) in each region
  on the goods with the lowest price in 市场 that day (Max, 2026-10-22).
- 资源回收站 (远程收取资源) is low priority (Max, 2026-10-22).
- 会客室 clues (Max, 2026-10-22): keep 1 of every clue type, give all extra ones to
  friends with no limit on gifts, and start 线索交流 whenever it can start. Runs
  before 信用点购物 (gifts pay 信用).
- 信用点购物 (Max, 2026-10-22): collect pending 信用 first; buy only goods at 75% off,
  plus 嵌晶玉 and 武库配额 (Max: "武器配额") at any discount. These are paid with 信用,
  so the 嵌晶玉 guard lets them through in this shop only. Spend the remaining 信用 on
  refreshes, buying by the same rule after each, until a refresh is unaffordable or
  none are left.
- Order (Max, 2026-10-22): the 信用 earners run before 信用点购物: 拜访好友 (生产助力,
  情报交流) and 会客室 gifts first, then the shop spends the day's 信用.
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
| E1 session start/exit | done | bundled build run `20261022-095446-2ntl` passed; 3 consecutive cold starts (cooldown retry included) → title → 月卡 notice/world → selftest passed → session exited: runs `20261022-093105-tn6j`, `-093208-aqib`, `-093330-ly2e`; failure path seen (`nav_world_timeout`, `session_start_timeout`). 2026-10-22 16:20: the game login failed (page notice 登录失败(-1) over the title), then the page logged out to its 验证码 form; `session_logged_out` now blocks at once (seen live), `session_login_failed` is unverified |
| E1 unattended with displays asleep | out of scope | Max (2026-10-22): runs happen with the display on; neither keeping the app open nor waking the display is wanted |
| E2 input layer | partial | key, click with deltas, Alt+click, drag implemented; Alt+click and drag not yet exercised through the engine |
| E3 recognition | partial | world/menu/settings/title/loading/boot/总控中枢/获得奖励 fingerprints; ESC-label template; item counts via `E.readNumber` (digits mode) verified on two reward frames; NCC matching untested on varied frames |
| E4 navigation | partial | nav to world from boot splash/title/月卡 notice/menu/settings observed |
| E5 runner/UI | partial | menu run/stop, per-task evidence, summary; no task options UI, no scheduler |
| 基建 快速收取 (`dijiang_collect`: 总控事项 产物 + 线索) | partial | bundled build run `20261022-130107-rl22`: 产物 collected through the task (获得奖励 高级认知载体 ×1, entry gone afterwards); 线索 through the task `20261022-095929-5qlz`; `nothing_to_do` `20261022-100330-nwju`. Missing for done: an unknown-state failure seen on this task |
| 日常奖励 · 行动手册日常 (`daily_tasks`) | partial | flow seen by hand 2026-10-22 10:05 (one 领取 claimed 2 rows, 活跃度 0 → 40; milestone 20 claimed 20+40 together, 获得奖励); task's `nothing_to_do` live with 活跃度 read 40 (`20261022-100757-v6t5`). Next: claim path through the task after the 04:00 reset |
| 日常奖励 · 邮件 (`mail_claim`) | partial | `nothing_to_do` live (`20261022-100935-uu8k`); claim path waits for mail with attachments |
| 日常奖励 · 转交委托/通行证/活动 | not started | |
| 简制手册 (`prod_manual`) | partial | navigation 背包 → 简易制作 → 简制手册 → first item and back observed; `nothing_to_do` live (`20261022-101138-xr9z`); 一键领取 path (from MaaEnd's flow) not yet seen on our stream |
| 据点交易 (`outpost_trading`) | partial | bundled build run `20261022-130107-rl22` passed at all 6 outposts with the shared region navigation (武陵 优质芽针针剂; 四号谷地 高容谷地电池 only; reserves emptied, goods kept far above 100). Earlier: goods chosen by stock through 更换货品 (`20261022-111235-9p2j`), tooltip covering 确认 fixed (`20261022-114544-ptau`). Before the 四号谷地 allowlist, runs also sold 荞愈胶囊 1460, 铁制零件 34360 (→ 100), 紫晶质瓶 1472 |
| 弹性物资囤货 (`stockpile`) | partial | 四号谷地 run `20261022-121906-ynnh` passed (hot-loaded source): quota 320 → 0, 硬脑壳头盔货组 ×320 at 394 (lowest of 12), owned 640 → 960, balance 11362821 → 11236741 = −126080, 购买成功 receipt 320. 武陵 bought by run `20261022-121606-83ao` (天师龙泡泡货组 ×230 at 1083, 购买成功 shows 230) which then failed on the then-unknown 购买成功 screen before its checks; `quota already used` path seen. bundled build run `20261022-130107-rl22`: both regions read quota 0 → `nothing_to_do`. Next: tomorrow's purchase through the bundled build |
| 会客室 线索赠予/交流 (`clue_exchange`) | partial | one gift by hand 2026-10-22 12:53 (寂语修会的线索 05: stock 2 → 1, 获得奖励 信用 40, 信用 148 → 188); task's `nothing_to_do` live (`20261022-125737-c4ol`: all 7 types read, 3 at 1, 4 greyed at 0; 线索交流 running, 03:53:50 left). 快速赠予重复线索 stayed disabled with a duplicate. 16:52: the ended exchange shows 情报交流结束 (额外奖励 信用 90, 6 friends, 确认; Esc does not close it), now confirmed by the task or by navigation (`20261022-165414-w9nx`, hot-loaded); a new exchange needs all 7 types on the board (集齐所有线索可开展情报交流, base reward 400), only 3 placed. Next: gift path when a type reaches 2; start 线索交流 once the board is full (快速填入 not yet seen enabled) |
| 信用点购物 (`credit_shop`) | partial | hot-loaded runs 2026-10-22: 收取信用 through the task in run `20261022-141756-5l6m` (获得奖励 信用 360, 188 → 548; then failed on the unknown 无待领取信用 state, now recognized); `-141937-4qqb` bought both −75% cards (折金票 ×2000 for 35: 548 → 513; 武器检查单元 ×30 for 22: 513 → 491); `-142237-upa1` refreshed (80: 491 → 411, 次数 4 → 3) and bought the new −75% 折金票 (411 → 376); `-142427-298f` passed: 嵌晶玉 ×25 at −25% for 300 信用 (376 → 76; 嵌晶玉 23735 → 23760 on the menu), then stopped at refresh cost 120 > 76. bundled build run `20261022-142628-rr5m` (session start → credit_shop → clue_exchange → session exit): `nothing_to_do`, refresh 120 > 信用 76. bundled build run `20261022-164526-18ty` passed after 拜访好友: refresh 120 (426 → 306, 次数 3 → 2), 嵌晶玉 ×25 for 300 (306 → 6), stopped at refresh 160 > 6. Next: the collect path through the bundled build after the 04:00 reset |
| 拜访好友 (`visit_friends`) | partial | hot-loaded runs 2026-10-22: `20261022-164345-lni9` passed: 4 情报交流 at 4 friends through the task (count 4 → 0, 信用 +50 each, 226 → 426), visit ended back to the world. 生产助力 through the task only once (`-163829-3llv`: 制造舱 II, count 3 → 2, 信用 166 → 186); the other presses were lost because the cursor left right after the click, now delayed; earlier assists by hand. bundled build run `20261022-165527-8wi8` (session start → visit_friends → clue_exchange → exit): entered a friend's ship, read 0/0 left, ended the visit → `nothing_to_do`. Next: 生产助力 through the fixed task after the 04:00 reset |
| 模拟空间奖励 | nothing to claim | 行动手册 → 模拟: 四号谷地 26/26, 武陵 23/23 complete (2026-10-22); revisit when a game update adds simulations |
| 资源回收站 | deferred | low priority (Max) |
| Other Phase 1–4 tasks | not started | |
