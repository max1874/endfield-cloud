// 基建 · 快速收取: on the 帝江号, the 总控中枢 lists pending 总控事项 such as 产物
// (收取并生产: collect every cabin's products and keep producing) and 线索 (领取并填入).
// Each press opens a 获得奖励 screen. One press does not always clear an entry: 产物
// went from 3 to 1 pending after one (2026-10-23), so an entry is pressed until it
// leaves the list. The last 产物 then opened nothing on further presses; an entry
// whose press opens no 获得奖励 is left with a note. Collecting spends nothing but
// the materials production consumes.
(() => {
  const E = window.__engine;
  if (!E) return;

  const PENDING = [0.84, 0.15, 0.16, 0.16];
  const ENTRIES = ['产物', '线索'];

  E.screen('control_nexus', look => look.has('总控中枢', [0, 0, 0.15, 0.07]) && look.has('运转报告', [0, 0.06, 0.15, 0.06]), 75);

  E.task('dijiang_collect', {
    title: '基建 · 总控事项',
    start: 'world',
    async run(t) {
      await E.key('KeyI');
      let nexus = await E.waitFor('control_nexus', { timeout: 10000 });
      const before = await t.save(nexus.frame, 'nexus-before');
      const pending = [];
      for (const entry of ENTRIES) if (await E.findText(nexus, entry, PENDING)) pending.push(entry);
      if (!pending.length) return t.skip('总控事项 has no 产物 or 线索 to collect');

      const MAX_PRESSES = 6;
      let presses = 0;
      for (const entry of pending) for (let n = 0; await E.findText(nexus, entry, PENDING); n++) {
        if (n === MAX_PRESSES) E.fail(`${entry}_still_pending_after_${n}_collects`);
        presses++;
        const button = await E.findText(nexus, entry, PENDING);
        await E.click(...E.center(button));
        const reward = await E.waitFor('reward', { timeout: 6000 }).catch(error => { if (error.kind === 'stopped') throw error; return null; });
        if (!reward) {
          await t.save(await E.grab(), `${entry === '产物' ? 'products' : 'clues'}-nothing-opened`);
          t.note(`${entry}: still pending, a press opened no 获得奖励`);
          nexus = await E.waitFor('control_nexus', { timeout: 10000 });
          break;
        }
        const key = `${entry === '产物' ? 'products' : 'clues'}${n ? n + 1 : ''}`;
        const shown = await t.save(reward.frame, `${key}-reward`);
        const items = await E.reward.read(reward);
        const banner = E.findAll(reward.texts, /已收取|已领取|已填入/, [0.1, 0.05, 0.8, 0.1]).map(t => t.text).join('');
        if (!items.length) E.fail(`${entry}_reward_without_items`);
        await E.reward.confirm();
        nexus = await E.waitFor('control_nexus', { timeout: 10000 });
        const after = await t.save(nexus.frame, `${key}-after`);
        const left = !!await E.findText(nexus, entry, PENDING);
        t.change({ what: entry, before: 'pending', after: left ? 'still pending' : 'collected', banner, items, frames: [before, shown, after] });
        if (items.some(item => item.count === null)) t.note(`${entry}: some counts unread`);
      }
      if (!t.changes.length) return t.skip(`总控事项 lists ${pending.join('、')}, but no press opened 获得奖励`);
      return t.pass(`${t.changes.length} collect(s) from ${pending.join('、')}`);
    }
  });
})();
