// 拜访好友: menu → 好友 → a friend's ship button → 是否拜访…？ 确定 → the friend's
// 帝江号 in guest mode. Y opens the 访客终端: today's counts (今日可情报交流次数,
// 今日可生产助力次数, 5 each) and one card per cabin with a button. 生产助力 pays 信用
// (+20) and several cabins of one friend can take it; 情报交流 (会客室, one per
// friend) pays 信用 (+50). A pressed button turns into 已助力 / 已交流. Tab (快速拜访
// 下位) moves to the next friend; Esc on the ship opens 选择拜访好友 with 结束拜访,
// which asks 是否要结束本次拜访？ and returns to our world. Nothing is spent.
(() => {
  const E = window.__engine;
  if (!E) return;

  const px = (x, y) => [x / 1920, y / 1080];
  const MAX_FRIENDS = 15;
  const FIRST_SHIP = px(1790, 236);
  const FRIEND = /#\d+$/;
  const FRIEND_AT = [0.75, 0, 0.2, 0.16];
  const BALANCE = /^(\d+)\s*\/\s*300$/;
  const BALANCE_AT = [0.85, 0, 0.12, 0.07];
  const BUTTONS = [0.12, 0.79, 0.78, 0.06];
  const COUNT = /(\d+)\s*\/\s*(\d+)/;

  E.screen('friends', look => look.has(/好友列表$/, [0, 0, 0.2, 0.07]), 72);
  // The dialog grows with the 交流项目 it lists; its title moves with it.
  E.screen('visit_ask', look => look.has(/^是否拜访/, [0.3, 0.35, 0.4, 0.13]), 77);
  E.screen('guest', look => look.has(/离开/, [0, 0, 0.1, 0.06]) && look.has(/正在拜访$/, [0.8, 0.03, 0.15, 0.06]), 72);
  E.screen('guest_terminal', look => look.has(/访客终端$/, [0, 0, 0.15, 0.07]), 73);
  E.screen('visit_pick', look => look.has(/选择拜访好友$/, [0, 0, 0.2, 0.07]), 72);
  E.screen('visit_end_ask', look => look.has(/是否要结束本次拜访/, [0.3, 0.45, 0.4, 0.06]), 77);

  const friend = look => E.find(look.texts, FRIEND, FRIEND_AT)?.text || null;
  const balance = look => {
    const text = E.find(look.texts, BALANCE, BALANCE_AT)?.text;
    return text ? Number(text.match(BALANCE)[1]) : null;
  };
  // "④3/5 今日可生产助力次数" may come as one text or split before the label.
  const count = (look, label) => {
    const at = E.find(look.texts, label);
    if (!at) return null;
    const near = at.text.match(COUNT) ? at : E.find(look.texts, COUNT, [at.x - 0.06, at.y - 0.01, 0.065, at.h + 0.02]);
    return near ? Number(near.text.match(COUNT)[1]) : null;
  };
  const counts = look => ({ clue: count(look, '今日可情报交流次数'), assist: count(look, '今日可生产助力次数') });
  // The cabin card a button belongs to: its name above the button.
  const cabin = (look, button) => {
    const [cx] = E.center(button);
    return E.find(look.texts, /\S{2,}/, [cx - 0.1, 0.645, 0.15, 0.04])?.text || '?';
  };

  async function confirmIn(look, roi) {
    const button = E.find(look.texts, /^确(定|认)/, roi);
    if (!button) E.fail(`${look.screen}_without_confirm`);
    await E.click(...E.center(button));
  }

  // Press every 情报交流 / 生产助力 button the day's counts still allow.
  async function useTerminal(t, name, index) {
    let look = await E.waitFor('guest_terminal', { timeout: 10000 });
    await E.park({ at: [0.5, 0.03], settle: 600 });
    look = await E.look();
    let left = counts(look);
    if (left.clue === null || left.assist === null) E.fail(`counts_unread_${left.clue}_${left.assist}`);
    if (index === 0) t.note(`today left: 情报交流 ${left.clue}, 生产助力 ${left.assist}`);
    const tried = new Set();
    for (let step = 0; step < 8; step++) {
      const wanted = [left.clue > 0 && '情报交流', left.assist > 0 && '生产助力'].filter(Boolean);
      const button = E.findAll(look.texts, /^(情报交流|生产助力)$/, BUTTONS)
        .find(b => wanted.includes(b.text) && !tried.has(Math.round(b.x * 100)));
      if (!button) break;
      tried.add(Math.round(button.x * 100));
      const kind = button.text === '情报交流' ? 'clue' : 'assist';
      const room = cabin(look, button);
      const before = balance(look);
      const shown = await t.save(look.frame, `f${index}-${kind}-before`);
      // Moving the cursor off right after the click lost most presses (14 of 15 in run
      // 20261022-163829-3llv); let the button take it first.
      await E.click(...E.center(button));
      await E.sleep(1000);
      await E.park({ at: [0.5, 0.03], settle: 1000 });
      look = await E.look();
      if (look.screen !== 'guest_terminal') {
        await t.save(look.frame, `f${index}-${kind}-unknown`);
        E.fail(`${kind}_ended_on_${look.screen}`);
      }
      const now = counts(look);
      if (now[kind] !== left[kind] - 1) {
        t.note(`${name} ${room}: ${button.text} left the count at ${now[kind]} (was ${left[kind]})`);
        left = now;
        continue;
      }
      const after = balance(look);
      const done = E.find(look.texts, kind === 'clue' ? '已交流' : '已助力', [button.x - 0.05, 0.79, button.w + 0.1, 0.06]);
      if (!done) E.fail(`${room}_${kind}_button_not_marked`);
      const frame = await t.save(look.frame, `f${index}-${kind}-after`);
      t.change({ what: `${name} ${room} ${button.text}`, left: { before: left[kind], after: now[kind] },
        credits: { before, after }, frames: [shown, frame] });
      if (before !== null && after !== null && after <= before) t.note(`${name} ${room}: 信用 ${before} → ${after}`);
      left = now;
    }
    await E.key('Escape');
    await E.waitFor('guest', { timeout: 10000 });
    return left;
  }

  // From the ship or its terminal: Esc until 选择拜访好友, then 结束拜访 → 确认.
  async function endVisit() {
    let pick = null;
    for (let i = 0; i < 3 && !pick; i++) {
      await E.key('Escape');
      pick = await E.waitFor('visit_pick', { timeout: 5000 }).catch(() => null);
    }
    if (!pick) E.fail('visit_pick_not_reached');
    const end = E.find(pick.texts, '结束拜访', [0.75, 0.87, 0.25, 0.08]);
    if (!end) E.fail('visit_pick_without_结束拜访');
    await E.click(...E.center(end));
    await confirmIn(await E.waitFor('visit_end_ask', { timeout: 8000 }), [0.5, 0.6, 0.2, 0.08]);
    await E.waitFor('world', { timeout: 90000 });
  }

  E.task('visit_friends', {
    title: '拜访好友 · 生产助力与情报交流',
    start: 'menu',
    async run(t) {
      await E.park();
      const menu = await E.look();
      const entry = E.find(menu.texts, /^好友$/);
      if (!entry) E.fail('menu_without_好友');
      await E.click(...E.center(entry));
      const list = await E.waitFor('friends', { timeout: 10000 });
      await t.save(list.frame, 'friends');
      await E.click(...FIRST_SHIP);
      const ask = await E.waitFor('visit_ask', { timeout: 8000 });
      await t.save(ask.frame, 'visit-ask');
      await confirmIn(ask, [0.5, 0.6, 0.2, 0.08]);
      let look = await E.waitFor('guest', { timeout: 90000 });
      try {
        const seen = new Set();
        for (let i = 0; i < MAX_FRIENDS; i++) {
          const name = friend(look);
          if (!name) E.fail('friend_name_unread');
          if (seen.has(name)) { t.note(`back at ${name}: every friend visited`); break; }
          seen.add(name);
          await E.key('KeyY');
          const left = await useTerminal(t, name, i);
          if (left.clue === 0 && left.assist === 0) break;
          await E.key('Tab');
          // The next friend's ship: the guest screen with another name.
          look = await E.waitFor('guest', { timeout: 90000, onLook: l => { if (l.screen === 'guest' && friend(l) === name) l.screen = 'same_friend'; } });
        }
      } catch (error) {
        await endVisit().catch(e => E.log(`visit_friends end_visit_failed ${e.message}`));
        throw error;
      }
      await endVisit();
      if (!t.changes.length) return t.skip('no 情报交流 or 生产助力 left today');
      return t.pass(`${t.changes.length} change(s)`);
    }
  });
})();
