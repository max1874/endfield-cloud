// 日常任务 · 领取: 行动手册, tab 日常. Completed daily tasks show 领取 and sort to the
// top; one press claimed every completed task at once (2026-10-22), adding each row's
// ×N to 活跃度. 活跃度 milestones (20 … 100) turn saturated yellow when claimable;
// pressing one claimed every reached milestone together and opened 获得奖励.
(() => {
  const E = window.__engine;
  if (!E) return;

  const LIST = [0.75, 0.27, 0.12, 0.6];
  const readActivity = async look => {
    const label = await E.findText(look, /活跃度/, [0.1, 0.65, 0.2, 0.25]);
    if (!label) E.fail('activity_label_not_found');
    const roi = [label.x - 0.004, label.y - 0.045, 0.07, 0.05];
    const value = await E.readNumber(look.frame, roi);
    if (value !== null) return value;
    for (const scale of [3, 4]) {
      const texts = await E.ocr(look.frame, roi, { scale });
      if (texts.length && texts.every(t => /^[0OoＯ〇]$/.test(t.text.trim()))) return 0;
    }
    E.fail('activity_unread');
  };
  const readMilestones = async look => {
    const milestones = [];
    for (const value of [20, 40, 60, 80, 100]) {
      const pattern = new RegExp(`(^|\\D)(${value})$`);
      const label = await E.findText(look, pattern, [0.18, 0.28, 0.08, 0.47]);
      if (!label) { milestones.push({ value }); continue; }
      const y = E.center(label)[1];
      milestones.push({ value: Number(label.text.match(pattern)[2]), at: [305 / 1920, y],
        ring: [272 / 1920, y - 4 / 1080, 6 / 1920, 8 / 1080] });
    }
    const missing = milestones.filter(m => !m.at).map(m => m.value);
    if (missing.length) E.fail(`milestones_unread_${missing.join('_')}`);
    return milestones;
  };
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
      const tab = await E.findText(look, /日常$/, [0.25, 0.19, 0.5, 0.06]);
      if (!tab) E.fail('handbook_without_日常_tab');
      await E.click(...E.center(tab));
      await E.sleep(800);
      look = await E.waitFor('handbook');
      const before = await t.save(look.frame, 'daily-before');
      const activityBefore = await readActivity(look);

      // Completed tasks: the activity each claimable row adds, then claim.
      let expected = 0, rows = 0;
      for (let round = 0; round < 3; round++) {
        const buttons = await E.findAllText(look, '领取', LIST);
        if (!buttons.length) break;
        for (const b of buttons) {
          // Dots flank the gain ("· ×20 ·") and may read as part of it.
          const gain = await E.findText(look, /[×xX]\s*\d+/, [0.66, b.y - 0.03, 0.08, 0.07]);
          if (!gain) { await t.save(look.frame, 'row-without-activity'); E.fail('claimable_row_without_activity'); }
          expected += Number(gain.text.match(/[×xX]\s*(\d+)/)[1]);
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
        activity = await readActivity(look);
        const shown = await t.save(look.frame, 'tasks-claimed');
        if (activity !== Math.min(100, activityBefore + expected))
          E.fail(`activity_not_reconciled_${activityBefore}+${expected}_read_${activity}`);
        t.change({ what: '活跃度', before: activityBefore, after: activity, rows, frames: [before, shown] });
      }

      // Reached milestones; below 20 none can be, so their labels need not read.
      const ready = activity < 20 ? [] : (await readMilestones(look)).filter(m => m.value <= activity && claimable(look.frame, m));
      if (ready.length) {
        await E.click(...ready[0].at);
        const reward = await E.waitFor('reward', { timeout: 10000 });
        const shown = await t.save(reward.frame, 'milestone-reward');
        const items = await E.reward.read(reward);
        if (!items.length) E.fail('milestone_reward_without_items');
        await E.reward.confirm();
        look = await E.waitFor('handbook');
        const after = await t.save(look.frame, 'milestones-after');
        const left = (await readMilestones(look)).filter(m => claimable(look.frame, m)).map(m => m.value);
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
