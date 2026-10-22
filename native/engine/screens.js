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
  // Same layout under other titles: 据点交易 (trade result, counts like "110万"); the
  // mailbox's 邮箱奖励 comes from MaaEnd's strings and is not yet seen here. Esc does
  // not close these.
  E.screen('reward', look => look.has(/获得奖励|邮箱奖励|据点交易/, [0.3, 0.09, 0.4, 0.07]), 76);
  E.reward = {
    async read(look) {
      const items = [];
      for (const name of E.findAll(look.texts, /\S/, REWARD_NAMES)) {
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

  // ---- navigation ----------------------------------------------------------------
  E.nav = {
    // Bring the game to `target` ('world', 'menu' or 'none') from any known screen.
    async to(target, t) {
      if (target === 'none') return null;
      const look = await toWorld();
      if (target === 'world') return look;
      if (target === 'menu') {
        await E.key('Escape');
        return E.waitFor('menu', { timeout: 8000 });
      }
      E.fail(`unknown_start_${target}`);
    }
  };

  async function toWorld({ timeout = 120000 } = {}) {
    const start = performance.now();
    let last = null, streak = 0, escapes = 0;
    while (performance.now() - start < timeout) {
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
          const hint = E.find(look.texts, TAP_HINT, TAP_REGION);
          E.log(`nav tap_notice "${hint.text}" -> click`);
          await E.click(...E.center(hint));
          await E.sleep(1500);
          break;
        }
        default:
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
