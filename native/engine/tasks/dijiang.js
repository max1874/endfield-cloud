// 基建 · 快速收取: on the 帝江号, the 总控中枢 lists pending 总控事项 such as 产物
// (收取并生产: collect every cabin's products and keep producing) and 线索 (领取并填入).
// Each entry opens a 获得奖励 screen; after confirming, the entry leaves the list.
// Collecting spends nothing but the materials production already consumes.
(() => {
  const E = window.__engine;
  if (!E) return;

  const PENDING = [0.84, 0.15, 0.16, 0.16];
  const ENTRIES = ['产物', '线索'];
  const REWARD_TITLE = [0.3, 0.09, 0.4, 0.07];
  const REWARD_NAMES = [0.1, 0.55, 0.8, 0.06];
  const REWARD_CONFIRM = [0.5, 0.874];

  E.screen('control_nexus', look => look.has('总控中枢', [0, 0, 0.15, 0.07]) && look.has('运转报告', [0, 0.06, 0.15, 0.06]), 75);
  E.screen('reward', look => look.has('获得奖励', REWARD_TITLE), 76);

  // Item names under the reward tiles and the count printed on each tile.
  const readReward = async look => {
    const items = [];
    for (const name of E.findAll(look.texts, /\S/, REWARD_NAMES)) {
      const [cx] = E.center(name);
      items.push({ name: name.text, count: await E.readNumber(look.frame, [cx - 0.02, name.y - 0.046, 0.04, 0.035]) });
    }
    const banner = E.findAll(look.texts, /已收取|已领取|已填入/, [0.1, 0.05, 0.8, 0.1]).map(t => t.text).join('');
    return { items, banner };
  };

  E.task('dijiang_collect', {
    title: '基建 · 快速收取',
    start: 'world',
    async run(t) {
      await E.key('KeyI');
      let nexus = await E.waitFor('control_nexus', { timeout: 10000 });
      const before = await t.save(nexus.frame, 'nexus-before');
      const pending = ENTRIES.filter(entry => nexus.has(entry, PENDING));
      if (!pending.length) return t.skip('总控事项 has no 产物 or 线索 to collect');

      for (const entry of pending) {
        const button = E.find(nexus.texts, entry, PENDING);
        await E.click(...E.center(button));
        const reward = await E.waitFor('reward', { timeout: 10000 });
        const shown = await t.save(reward.frame, `${entry === '产物' ? 'products' : 'clues'}-reward`);
        const { items, banner } = await readReward(reward);
        if (!items.length) E.fail(`${entry}_reward_without_items`);
        await E.click(...REWARD_CONFIRM);
        nexus = await E.waitFor('control_nexus', { timeout: 10000 });
        const after = await t.save(nexus.frame, `${entry === '产物' ? 'products' : 'clues'}-after`);
        if (nexus.has(entry, PENDING)) E.fail(`${entry}_still_pending_after_collect`);
        t.change({ what: entry, before: 'pending', after: 'collected', banner, items, frames: [before, shown, after] });
        if (items.some(item => item.count === null)) t.note(`${entry}: some counts unread`);
      }
      return t.pass(`collected ${pending.join('、')}`);
    }
  });
})();
