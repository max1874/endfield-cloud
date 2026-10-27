// 邮件 · 全部收取: main menu envelope → 邮箱 → 全部收取. With nothing to claim the
// press changes nothing (2026-10-22). Never press 删除已读 or 删除邮件.
(() => {
  const E = window.__engine;
  if (!E) return;

  // The envelope in the main menu's top bar, with the cursor parked.
  const MAIL = [0.229, 0.088];
  const CLAIM_ALL = [0, 0.88, 0.3, 0.1];

  E.screen('mailbox', look => look.has(/邮/, [0, 0, 0.12, 0.07]) && look.has(/收件/, [0, 0.06, 0.15, 0.05]), 75);

  E.task('mail_claim', {
    title: '邮件 · 全部收取',
    start: 'menu',
    async run(t) {
      await E.park();
      await E.click(...MAIL);
      let look = await E.waitFor('mailbox', { timeout: 10000 });
      const before = await t.save(look.frame, 'mailbox-before');
      const button = await E.findText(look, /^全部收取$/, CLAIM_ALL);
      if (!button) E.fail('mailbox_without_全部收取');
      await E.click(...E.center(button));
      let reward = null;
      try { reward = await E.waitFor('reward', { timeout: 4000 }); } catch (error) { if (error.kind !== 'timeout') throw error; }
      if (!reward) {
        look = await E.waitFor('mailbox');
        await t.save(look.frame, 'mailbox-unchanged');
        return t.skip('全部收取 opened no reward: no attachments to claim');
      }
      const shown = await t.save(reward.frame, 'mail-reward');
      const items = await E.reward.read(reward);
      if (!items.length) E.fail('mail_reward_without_items');
      await E.reward.confirm();
      look = await E.waitFor('mailbox');
      const after = await t.save(look.frame, 'mailbox-after');
      t.change({ what: '邮件附件', before: 'unclaimed', after: 'claimed', items, frames: [before, shown, after] });
      if (items.some(item => item.count === null)) t.note('some counts unread');
      return t.pass(`claimed ${items.length} item kinds`);
    }
  });
})();
