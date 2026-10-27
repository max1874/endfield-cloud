// 简制手册 · 领取: 背包 (B) → 简易制作 → 简制手册 → first item. Its detail view lists
// collection milestones (已领取 once claimed). When anything is claimable the view
// offers 一键领取 (MaaEnd's flow; not yet seen here), followed by 获得奖励 and
// possibly a "点击屏幕继续" unlock notice.
(() => {
  const E = window.__engine;
  if (!E) return;

  const FIRST_CARD = [0.234, 0.288];

  E.screen('backpack', look => look.has('背包', [0.6, 0.15, 0.1, 0.08]) && look.has('简易制作', [0.7, 0.22, 0.25, 0.08]), 74);
  E.screen('crafting', look => look.has(/简易制作$/, [0, 0, 0.12, 0.07]) && look.has('简制手册', [0.75, 0, 0.25, 0.07]), 74);
  E.screen('manual', look => look.has(/简制手册$/, [0.12, 0.15, 0.2, 0.06]) && look.has('每获取对应数量物品'), 74);
  E.screen('manual_item', look => look.has(/简制手册$/, [0.12, 0.15, 0.2, 0.06]) && look.has('收集进度'), 74);

  const press = async (look, text, roi) => {
    const button = await E.findText(look, text, roi);
    if (!button) E.fail(`missing_${text}`);
    await E.click(...E.center(button));
  };

  E.task('prod_manual', {
    title: '简制手册 · 领取',
    start: 'world',
    async run(t) {
      await E.key('KeyB');
      await press(await E.waitFor('backpack', { timeout: 10000 }), '简易制作', [0.7, 0.22, 0.25, 0.08]);
      await press(await E.waitFor('crafting', { timeout: 10000 }), '简制手册', [0.75, 0, 0.25, 0.07]);
      await E.waitFor('manual', { timeout: 10000 });
      await E.click(...FIRST_CARD);
      let look = await E.waitFor('manual_item', { timeout: 10000 });
      const before = await t.save(look.frame, 'manual-before');
      const claimAll = await E.findText(look, /一键领取/, [0, 0.45, 1, 0.5]);
      if (!claimAll) return t.skip('no 一键领取: nothing to claim');
      await E.click(...E.center(claimAll));

      const rewards = [];
      for (let step = 0; step < 12; step++) {
        await E.sleep(600);
        look = await E.look();
        if (look.screen === 'reward') {
          const frame = await t.save(look.frame, `manual-reward-${rewards.length}`);
          rewards.push({ items: await E.reward.read(look), frame });
          await E.reward.confirm();
        } else if (look.has('点击屏幕继续')) {
          await t.save(look.frame, `manual-notice-${step}`);
          await E.click(0.5, 0.5);
        } else if (look.screen === 'manual_item') {
          if (await E.findText(look, /一键领取/, [0, 0.45, 1, 0.5])) continue;
          break;
        } else {
          throw new E.EngineError('failed', `unexpected_screen_${look.screen}`, { look });
        }
      }
      look = await E.waitFor('manual_item');
      const after = await t.save(look.frame, 'manual-after');
      if (await E.findText(look, /一键领取/, [0, 0.45, 1, 0.5])) E.fail('一键领取_still_offered');
      if (!rewards.length) E.fail('一键领取_without_reward');
      t.change({ what: '简制手册奖励', before: 'claimable', after: 'claimed', rewards, frames: [before, ...rewards.map(r => r.frame), after] });
      return t.pass(`claimed ${rewards.length} reward screen(s)`);
    }
  });
})();
