// Base screens. Tasks add their own with E.screen(). Every fingerprint uses anchors
// that do not depend on the 3D background; anything unmatched stays "unknown".
(() => {
  const E = window.__engine;
  if (!E || E.nav) return;

  const MENU_LABELS = ['干员', '行动手册', '好友', '贵重品库', '采购中心', '地区建设', '装备加工', '档案库'];

  E.screen('loading', look => look.has('LOADING'), 100);
  E.screen('title', look => look.has('点击任意位置继续', [0.5, 0.4, 0.5, 0.25]), 90);
  E.screen('menu', look => MENU_LABELS.filter(label => look.has(label)).length >= 3, 80);
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
        case 'loading': await E.sleep(1000); break;
        case 'title':
          E.log('nav title -> click');
          await E.click(0.5, 0.6);
          await E.sleep(3000);
          break;
        default:
          // Esc closes every panel and dialog we know; on an unknown screen it is the
          // safest generic action. Too many in a row means we are stuck.
          if (++escapes > 8) throw new E.EngineError('timeout', `nav_stuck_on_${look.screen}`, { look });
          E.log(`nav ${look.screen} -> Escape`);
          await E.key('Escape');
          await E.sleep(700);
      }
      streak = 0;
    }
    throw new E.EngineError('timeout', `nav_world_timeout_last_${last?.screen}`, { look: last });
  }
})();
