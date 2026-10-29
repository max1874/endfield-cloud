// Base screens. Tasks add their own with E.screen(). Every fingerprint uses anchors
// that do not depend on the 3D background; anything unmatched stays "unknown".
(() => {
  const E = window.__engine;
  if (!E || E.nav) return;

  const MENU_LABELS = ['干员', '行动手册', '好友', '贵重品库', '采购中心', '地区建设', '装备加工', '档案库'];

  E.screen('loading', look => look.has('LOADING'), 100);
  // The game's boot splashes (publisher, health and photosensitivity notices, age
  // rating) and the black frames between them come before the title; they pass by
  // themselves and must not burn Escapes. The title shows the age rating too, so
  // this ranks below it.
  E.screen('boot', look => look.texts.length === 0 || look.has(/HYPERGRYPH|游戏前请详细阅读|适合年满|适龄提示|CADPA/), 60);
  // The prompt pulses and some frames miss it; the build string ("CN_WIN_REL 1.6.3 …")
  // shows only on the title, not on the boot splashes.
  E.screen('title', look => look.has('点击任意位置继续', [0.5, 0.4, 0.5, 0.25]) || look.has(/WIN.?REL/), 90);
  // Full-screen notices that close on a click and show the hint in the lower half,
  // e.g. the daily 月卡 reward after login ("- 点击确认今日月卡奖励 -"); Esc does
  // not close it. They only hand out items.
  const TAP_HINT = /点击(确认|任意位置|空白处)/;
  const TAP_REGION = [0.15, 0.55, 0.7, 0.4];
  E.screen('tap_notice', look => look.has(TAP_HINT, TAP_REGION), 85);
  E.screen('menu', look => MENU_LABELS.filter(label => look.has(label)).length >= 3, 80);

  // ---- 获得奖励 ------------------------------------------------------------------
  // The shared reward screen: a row of item tiles (count printed on the tile, name
  // under it) and a confirm check at the bottom. Seen after 基建 collection and
  // 行动手册 milestones.
  const REWARD_NAMES = [0.1, 0.55, 0.8, 0.06];
  // Same layout under other titles: 据点交易 (trade result, counts like "110万"),
  // 购买成功 (物资调度 purchase), 奖励 (简制手册); the mailbox's 邮箱奖励 comes from MaaEnd's strings
  // and is not yet seen here. Esc does not close these.
  E.screen('reward', look => look.has(/获得奖励|邮箱奖励|据点交易|购买成功|^奖励$/, [0.3, 0.09, 0.4, 0.07]), 76);
  E.reward = {
    // `names`: where the name labels sit; two-row rewards (生态农场) pass their own.
    async read(look, names = REWARD_NAMES) {
      const items = [];
      for (const name of await E.findAllText(look, /\D/, names)) {
        const [cx] = E.center(name);
        const roi = [cx - 0.02, name.y - 0.046, 0.04, 0.035];
        // Large counts carry a unit ("110万"); keep the text next to the number. Read
        // the crop itself: full-frame OCR missed a "1万" tile (2026-10-22).
        const wide = [roi[0] - 0.01, roi[1], roi[2] + 0.02, roi[3]];
        let unit = E.find(look.texts, /\d+(\.\d+)?万/, wide);
        for (const scale of [4, 3]) {
          if (unit) break;
          const joined = (await E.ocr(look.frame, wide, { scale, digits: true })).map(t => t.text).join('');
          const match = joined.match(/\d+(\.\d+)?万/);
          if (match) unit = { text: match[0] };
        }
        items.push({ name: name.text, count: unit ? null : await E.readNumber(look.frame, roi), text: unit?.text });
      }
      return items;
    },
    // Confirm and wait until the reward screen is gone.
    async confirm() {
      await E.click(0.5, 0.874);
      for (let i = 0; i < 20; i++) {
        await E.sleep(300);
        if ((await E.look()).screen !== 'reward') return;
      }
      E.fail('reward_not_closed');
    }
  };
  E.screen('settings', look => look.has('设置', [0, 0, 0.12, 0.07]), 70);
  // In the world the top-right key hints are drawn on dark label boxes, so the ESC
  // label matches whatever the scene behind it. Full-screen panels hide it.
  E.screen('world', async look => (await E.match(look.frame, 'hud_esc', [0.945, 0, 0.055, 0.045])).score >= 0.8, 0);

  // ---- ship navigation ----------------------------------------------------------
  const WHOLE_MAP = [0.1, 0.08, 0.8, 0.84];
  // The 帝江号 map shows 总控中枢等级 on top, a region map 地区建设等级 at the bottom
  // left or 地区总览 at the bottom right. The map title sits on a busy background and
  // OCR often misses it.
  const SHIP_MAP = [0.4, 0.02, 0.2, 0.06];
  E.screen('map', look => look.has(/总控中枢等级/, SHIP_MAP) || look.has(/地区建设等级/, [0, 0.89, 0.12, 0.05]) || look.has('地区总览', [0.8, 0.88, 0.18, 0.08]), 71);

  async function openMap() {
    await E.key('KeyM');
    let map = await E.waitFor('map', { timeout: 10000 });
    if (!await E.findText(map, /总控中枢等级/, SHIP_MAP)) {
      // Another region's map: its corner lists the 帝江号.
      const ship = await E.findText(map, /帝江号$/, [0.8, 0.1, 0.2, 0.06]);
      if (!ship) E.fail('map_without_帝江号');
      await E.click(...E.center(ship));
      await E.sleep(1500);
      map = await E.waitFor('map', { timeout: 10000 });
      if (!await E.findText(map, /总控中枢等级/, SHIP_MAP)) E.fail('map_not_switched_to_帝江号');
    }
    return map;
  }

  // Map → the kiosk's icon → 前往传送 selects the nearest 协议传送点 → 传送. The
  // teleport also resets the camera behind the character, facing east. Near the
  // kiosk the player's arrow covers part of the icon; it still takes the click.
  E.teleportToContactKiosk = async t => {
    const map = await openMap();
    let icon = await E.match(map.frame, 'map_contact_station', WHOLE_MAP, { step: 2 });
    if (icon.score < 0.7) icon = await E.match(map.frame, 'map_contact_station', [0.44, 0.38, 0.12, 0.24]);
    if (icon.score < 0.25) {
      await t.save(map.frame, 'map-without-kiosk');
      E.fail(`kiosk_icon_not_found_${icon.score.toFixed(2)}`);
    }
    await E.click(icon.x + icon.w / 2, icon.y + icon.h / 2);
    await E.sleep(1500);
    let look = await E.look();
    const go = await E.findText(look, '前往传送', [0.7, 0.85, 0.15, 0.1]);
    if (!go) {
      await t.save(look.frame, 'kiosk-panel');
      // A click beside the icon opens a new custom marker instead: cancel it.
      const cancel = await E.findText(look, '取消', [0.75, 0.88, 0.12, 0.08]);
      if (cancel) { await E.click(...E.center(cancel)); await E.sleep(800); }
      E.fail('kiosk_panel_without_前往传送');
    }
    await E.click(...E.center(go));
    await E.sleep(1500);
    look = await E.look();
    // The button's icon can read as trailing characters.
    const jump = await E.findText(look, /^传送/, [0.85, 0.85, 0.15, 0.1]);
    if (!jump) { await t.save(look.frame, 'anchor-panel'); E.fail('anchor_panel_without_传送'); }
    await E.click(...E.center(jump));
    await E.waitFor('world', { timeout: 60000 });
    await E.sleep(1000);
  };

  // I may be unavailable in some world locations. Retry once from the ship's
  // contact-kiosk teleport anchor, sharing the same route as operator gifts.
  E.openControlNexus = async t => {
    await E.key('KeyI');
    try {
      return await E.waitFor('control_nexus', { timeout: 10000 });
    } catch (error) {
      if (!(error instanceof E.EngineError) || error.kind !== 'timeout' || error.detail?.look?.screen !== 'world') throw error;
      const frame = await t.save(error.detail.look.frame, 'nexus-unavailable-here');
      t.note(`I left the world open (${frame}); teleporting to the contact kiosk before one retry`);
    }
    await E.teleportToContactKiosk(t);
    await E.key('KeyI');
    return E.waitFor('control_nexus', { timeout: 10000 });
  };

  // ---- 地区建设 -------------------------------------------------------------------
  // Menu → 地区建设 opens the last viewed region; the switch icon left of the region
  // name opens a picker with one card per region and 确认.
  E.screen('region', look => look.has('地区建设管理') && look.has('据点管理'), 74);
  const REGIONS = ['武陵', '四号谷地'];
  const REGION_NAME = [0.07, 0.23, 0.15, 0.08];
  const REGION_SWITCH = [92 / 1920, 318 / 1080];
  E.regions = {
    async name(look) {
      for (const region of REGIONS) if (await E.findText(look, region, REGION_NAME)) return region;
      return null;
    },
    // On the 地区建设 screen: open the picker, choose `target`, confirm.
    async switchTo(target) {
      await E.click(...REGION_SWITCH);
      await E.sleep(1200);
      let look = await E.look();
      const card = await E.findText(look, new RegExp(`${target}$`), [0.3, 0.28, 0.4, 0.06]);
      if (!card) E.fail(`region_picker_without_${target}`);
      await E.click(...E.center(card));
      // The confirm dialog showed after more than 800 ms once (2026-10-23).
      let confirm = null;
      for (let i = 0; i < 10 && !confirm; i++) {
        await E.sleep(500);
        look = await E.look();
        confirm = await E.findText(look, /^确认/, [0.45, 0.55, 0.25, 0.1]);
      }
      if (!confirm) E.fail('region_picker_without_确认');
      await E.click(...E.center(confirm));
      for (let i = 0; i < 20; i++) {
        await E.sleep(500);
        look = await E.look();
        if (look.screen === 'region' && await E.regions.name(look) === target) return look;
      }
      E.fail(`region_not_switched_to_${target}`);
    },
    // From the menu: for every region (the one shown first), open the management
    // entry `label` (据点管理, 物资调度, ...), run `fn(region)`, and Escape back.
    async visit(t, label, fn) {
      await E.park();
      const menu = await E.look();
      const entry = E.find(menu.texts, '地区建设');
      if (!entry) E.fail('menu_without_地区建设');
      await E.click(...E.center(entry));
      let region = await E.waitFor('region', { timeout: 10000 });
      const first = await E.regions.name(region);
      if (!first) E.fail('region_name_unread');
      for (const name of [first, ...REGIONS.filter(r => r !== first)]) {
        if (await E.regions.name(region) !== name) region = await E.regions.switchTo(name);
        await t.save(region.frame, `region-${name === '武陵' ? 'wuling' : 'valley'}`);
        const button = E.find(region.texts, label);
        if (!button) E.fail(`region_without_${label}`);
        await E.click(...E.center(button));
        await fn(name);
        await E.key('Escape');
        region = await E.waitFor('region', { timeout: 10000 });
      }
    }
  };

  // ---- navigation ----------------------------------------------------------------
  E.nav = {
    // Screens Esc does not close, by name: an async look => void that closes them.
    // Tasks register their own.
    dismiss: {},
    // Bring the game to `target` ('world', 'menu' or 'none') from any known screen.
    async to(target, t) {
      if (target === 'none') return null;
      const look = await toWorld();
      if (target === 'world') return look;
      if (target === 'menu') {
        await E.key('Escape');
        let look = await E.waitFor('menu', { timeout: 8000 });
        // The menu counts as shown while its entries still slide in. Right after a
        // login a click meant for 地区建设 opened 行动手册 (2026-10-23), so wait until
        // the entries hold still between two looks with the cursor parked.
        for (let i = 0; i < 10; i++) {
          await E.park({ settle: 500 });
          const next = await E.look();
          const moved = MENU_LABELS.some(label => {
            const a = E.find(look.texts, label), b = E.find(next.texts, label);
            return !a || !b || Math.hypot(a.x - b.x, a.y - b.y) > 0.004;
          });
          look = next;
          if (!moved && next.screen === 'menu') return next;
        }
        return look;
      }
      E.fail(`unknown_start_${target}`);
    }
  };

  async function toWorld({ timeout = 120000 } = {}) {
    const start = performance.now();
    let last = null, streak = 0, escapes = 0;
    while (performance.now() - start < timeout) {
      // A failed game login shows as a page notice the stream cannot see.
      if (E.session?.state() === 'login_failed') E.block('session_login_failed');
      const look = await E.look();
      streak = last && last.screen === look.screen ? streak + 1 : 1;
      last = look;
      if (streak < 2) { await E.sleep(200); continue; }
      switch (look.screen) {
        case 'world': return look;
        case 'loading': case 'boot': await E.sleep(1000); break;
        case 'title':
          E.log('nav title -> click');
          await E.click(0.5, 0.6);
          await E.sleep(3000);
          break;
        case 'reward':
          E.log('nav reward -> confirm');
          await E.reward.confirm();
          break;
        case 'tap_notice': {
          const hint = await E.findText(look, TAP_HINT, TAP_REGION);
          E.log(`nav tap_notice "${hint.text}" -> click`);
          await E.click(...E.center(hint));
          await E.sleep(1500);
          break;
        }
        default:
          if (E.nav.dismiss[look.screen]) {
            E.log(`nav ${look.screen} -> dismiss`);
            await E.nav.dismiss[look.screen](look);
            await E.sleep(700);
            break;
          }
          // Esc closes every panel and dialog we know; on an unknown screen it is the
          // safest generic action. Too many in a row means we are stuck.
          if (++escapes > 8) throw new E.EngineError('timeout', `nav_stuck_on_${look.screen}`, { look });
          E.log(`nav ${look.screen} -> Escape texts=${look.texts.slice(0, 8).map(x => x.text).join('|')}`);
          await E.key('Escape');
          await E.sleep(700);
      }
      streak = 0;
    }
    throw new E.EngineError('timeout', `nav_world_timeout_last_${last?.screen}`, { look: last });
  }
})();
