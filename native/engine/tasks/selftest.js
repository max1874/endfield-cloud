// Engine self-test: world -> menu -> settings -> back to the world. Changes nothing in
// the game; its "change" is the sequence of screens the engine recognized.
(() => {
  const E = window.__engine;
  if (!E) return;
  // Settings gear in the main menu, with the cursor parked at the center.
  const SETTINGS_GEAR = [0.173, 0.096];

  E.task('selftest', {
    title: '引擎自检（设置往返）',
    start: 'world',
    async run(t) {
      const world = await E.waitFor('world');
      const before = await t.save(world.frame, 'world');
      await E.key('Escape');
      await E.park();
      const menu = await E.waitFor('menu');
      await t.save(menu.frame, 'menu');
      await E.click(...SETTINGS_GEAR);
      const settings = await E.waitFor('settings');
      const shown = await t.save(settings.frame, 'settings');
      await E.key('Escape');
      await E.waitFor('menu');
      await E.key('Escape');
      const back = await E.waitFor('world');
      const after = await t.save(back.frame, 'world-again');
      t.change({ what: 'screens', path: ['world', 'menu', 'settings', 'menu', 'world'], frames: [before, shown, after] });
      return t.pass('settings opened and closed; back in the world');
    }
  });
})();
