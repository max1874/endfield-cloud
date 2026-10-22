// 日常任务 · 领取: 行动手册, tab 日常. Completed daily tasks show 领取 and sort to the
// top; one press claimed every completed task at once (2026-10-22), adding each row's
// ×N to 活跃度. 活跃度 milestones (20 … 100) turn saturated yellow when claimable;
// pressing one claimed every reached milestone together and opened 获得奖励.
(() => {
  const E = window.__engine;
  if (!E) return;

  const LIST = [0.75, 0.27, 0.12, 0.6];
  const ACTIVITY = [0.178, 0.76, 0.07, 0.05];
  const MILESTONES = [735, 640, 544, 449, 355].map((y, i) => ({ value: 20 * (i + 1), at: [305 / 1920, y / 1080],
    ring: [272 / 1920, (y - 4) / 1080, 6 / 1920, 8 / 1080] }));
  // Claimable rings measured [201,193,61]; claimed ones are dim olive, locked ones gray.
  const claimable = (frame, m) => { const [r, g, b] = E.color(frame, m.ring); return r > 170 && g > 160 && b < 110; };

  E.screen('handbook', look => look.has('行动手册', [0, 0, 0.15, 0.07]), 75);

  E.task('daily_tasks', {
    title: '日常任务 · 领取',
    start: 'menu',
    async run(t) {
      await E.park();
      const menu = await E.look();
      const entry = E.find(menu.texts, '行动手册');
      if (!entry) E.fail('menu_without_行动手册');
      await E.click(...E.center(entry));
      let look = await E.waitFor('handbook', { timeout: 10000 });
      const tab = E.find(look.texts, /日常$/, [0.25, 0.19, 0.5, 0.06]);
      if (!tab) E.fail('handbook_without_日常_tab');
      await E.click(...E.center(tab));
      await E.sleep(800);
      look = await E.waitFor('handbook');
      const before = await t.save(look.frame, 'daily-before');
      const activityBefore = await E.readNumber(look.frame, ACTIVITY);
      if (activityBefore === null) E.fail('activity_unread');

      // Completed tasks: the activity each claimable row adds, then claim.
      let expected = 0, rows = 0;
      for (let round = 0; round < 3; round++) {
        const buttons = E.findAll(look.texts, '领取', LIST);
        if (!buttons.length) break;
        for (const b of buttons) {
          const gain = E.find(look.texts, /^[×xX]\s*\d+$/, [0.66, b.y - 0.03, 0.08, 0.07]);
          if (!gain) E.fail('claimable_row_without_activity');
          expected += Number(gain.text.replace(/\D/g, ''));
          rows++;
        }
        await E.click(...E.center(buttons[0]));
        await E.sleep(1500);
        look = await E.look();
        if (look.screen === 'reward') { await E.reward.confirm(); look = await E.look(); }
      }
      let activity = activityBefore;
      if (rows) {
        look = await E.waitFor('handbook');
        activity = await E.readNumber(look.frame, ACTIVITY);
        const shown = await t.save(look.frame, 'tasks-claimed');
        if (activity !== Math.min(100, activityBefore + expected))
          E.fail(`activity_not_reconciled_${activityBefore}+${expected}_read_${activity}`);
        t.change({ what: '活跃度', before: activityBefore, after: activity, rows, frames: [before, shown] });
      }

      // Reached milestones.
      const ready = MILESTONES.filter(m => m.value <= activity && claimable(look.frame, m));
      if (ready.length) {
        await E.click(...ready[0].at);
        const reward = await E.waitFor('reward', { timeout: 10000 });
        const shown = await t.save(reward.frame, 'milestone-reward');
        const items = await E.reward.read(reward);
        if (!items.length) E.fail('milestone_reward_without_items');
        await E.reward.confirm();
        look = await E.waitFor('handbook');
        const after = await t.save(look.frame, 'milestones-after');
        const left = MILESTONES.filter(m => claimable(look.frame, m)).map(m => m.value);
        if (left.length) E.fail(`milestones_still_claimable_${left.join('_')}`);
        t.change({ what: '活跃度奖励', milestones: ready.map(m => m.value), items, frames: [shown, after] });
      }

      if (!t.changes.length) {
        await t.save(look.frame, 'daily-nothing');
        return t.skip(`活跃度 ${activityBefore}; no completed task or milestone to claim`);
      }
      return t.pass(`活跃度 ${activityBefore} → ${activity}`);
    }
  });
})();
