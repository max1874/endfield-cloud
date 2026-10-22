// 信用点购物: menu → 采购中心 → 信用交易所. Max's rules (2026-10-22): collect pending
// 信用 first (收取信用); buy only goods at 75% off, plus 嵌晶玉 and 武库配额 at any
// discount; spend what is left on refreshes (立即刷新: a few per day, the cost is on
// the button) and buy by the same rule after each. The shop shows up to two rows of
// 7 cards: a discount tag top right ("-75%"), the price above the name bar. A card
// opens 购买商品 with the price, the discount, 总计支付 and 确认购买. 收取信用 may lift
// 信用 above 300 (548/300 on 2026-10-22); the overflow is cleared after a countdown.
(() => {
  const E = window.__engine;
  if (!E) return;

  const px = (x, y) => [x / 1920, y / 1080];
  const OFF = 75;
  const ALWAYS = /^(嵌晶玉|武库配额)$/;
  const TITLE = [0, 0, 0.15, 0.07];
  const BALANCE = /^(\d+)\s*\/\s*300$/;
  const BALANCE_AT = [0.85, 0, 0.12, 0.07];
  // Name bars of the two card rows (text center y ≈ 0.40 and 0.69).
  const ROWS = [[0.05, 0.38, 0.9, 0.045], [0.05, 0.667, 0.9, 0.045]];
  const COLLECT = [0.02, 0.89, 0.12, 0.05];
  // 立即刷新 and its cost; full-frame OCR sometimes reads them as one text.
  const REFRESH = [0.82, 0.89, 0.14, 0.05];
  const REFRESH_COST = [0.87, 0.89, 0.06, 0.05];
  const REFRESHES = /剩余次数[:：]?\s*(\d+)\s*\/\s*(\d+)/;
  // 购买商品 dialog
  const ITEM_NAME = [0.36, 0.25, 0.2, 0.04];
  const ITEM_OFF = [0.8, 0.32, 0.06, 0.05];
  // 总计支付 is right-aligned after the 信用 icon; a cropped OCR reads the icon as its
  // own token ("⑧"), where digit votes read it as a leading 1 or cut off "300".
  const ITEM_TOTAL = [0.765, 0.7, 0.075, 0.045];
  const DIALOG_BALANCE = [0.89, 0.02, 0.05, 0.045];
  const CONFIRM = [0.68, 0.76, 0.18, 0.08];
  const CLOSE = px(1622, 220);
  // Where a premium item bought with 信用 names itself (name, description); the
  // price row and 总计支付 stay guarded.
  const ITEM_INFO = [[0.36, 0.25, 0.25, 0.06], [0.36, 0.38, 0.6, 0.1]];
  // Card labels may name 嵌晶玉; the refresh guard reads only the bottom bar.
  const CARDS = [0, 0.13, 1, 0.75];

  E.screen('shop', look => look.has(/采购中心$/, TITLE), 73);
  // The collect button reads 无待领取信用 once nothing is pending.
  const COLLECTED = '无待领取信用';
  E.screen('credit_shop', look => look.has(/采购中心$/, TITLE) && look.has(/^(收取信用|无待领取信用)$/, COLLECT), 74);
  E.screen('credit_buy', look => look.has(/购买商品$/, [0.13, 0.17, 0.2, 0.05]), 77);
  // 立即刷新 asks first: "刷新商品货品将会消耗80信用，是否确认刷新？" (the cost rises
  // with each refresh of the day).
  const REFRESH_ASK = /消耗(\d+)信用.*是否确认刷新/;
  E.screen('credit_refresh', look => look.has(REFRESH_ASK, [0.25, 0.43, 0.5, 0.08]), 77);

  const balance = look => {
    const text = E.find(look.texts, BALANCE, BALANCE_AT)?.text;
    return text ? Number(text.match(BALANCE)[1]) : null;
  };

  const cards = look => ROWS.flatMap(row => E.findAll(look.texts, /\S{2,}/, row).map(name => {
    const [cx, cy] = E.center(name);
    const tag = E.find(look.texts, /^-\d+%$/, [cx, cy - 0.27, 0.07, 0.07]);
    // A bought card stays in place under a 售罄 overlay.
    const soldOut = E.find(look.texts, /售罄/, [cx - 0.07, cy - 0.16, 0.14, 0.08]) !== null;
    return { name: name.text, off: tag ? Number(tag.text.slice(1, -1)) : 0, soldOut, at: [cx, cy - 0.15],
      key: `${Math.round(cx * 100)}:${Math.round(cy * 100)}` };
  }));
  const wanted = card => !card.soldOut && (card.off === OFF || ALWAYS.test(card.name));

  // Wait for the shop list (seen twice in a row), confirming any reward on the way.
  async function backToShop(t, label) {
    let streak = 0, receipt = null, look = null;
    for (let i = 0; i < 30; i++) {
      await E.sleep(500);
      look = await E.look();
      if (look.screen === 'reward') {
        receipt = { frame: await t.save(look.frame, `${label}-receipt`), items: await E.reward.read(look) };
        await E.reward.confirm();
        streak = 0;
      } else if (look.screen === 'credit_shop' && ++streak >= 2) {
        await E.park({ at: [0.5, 0.03], settle: 600 });
        return { look: await E.look(), receipt };
      } else if (look.screen !== 'credit_shop') streak = 0;
    }
    await t.save(look.frame, `${label}-unknown`);
    E.fail(`${label}_ended_on_${look.screen}`);
  }

  async function collect(t) {
    const look = await E.look();
    const before = balance(look);
    if (before === null) E.fail('balance_unread');
    if (look.has(COLLECTED, COLLECT)) return t.note(`收取信用: nothing pending (信用 ${before})`);
    const shown = await t.save(look.frame, 'collect-before');
    await E.click(...E.center(E.find(look.texts, '收取信用', COLLECT)));
    const { look: after, receipt } = await backToShop(t, 'collect');
    const now = balance(after);
    const frame = await t.save(after.frame, 'collect-after');
    if (now === null) E.fail('balance_unread_after_collect');
    if (now <= before) E.fail(`collect_balance_${before}_to_${now}`);
    t.change({ what: '收取信用', credits: { before, after: now }, items: receipt?.items ?? null,
      frames: [shown, receipt?.frame, frame].filter(Boolean) });
  }

  // Buy one card; returns false when 信用 cannot pay for it.
  async function buy(t, card, index) {
    await E.click(...card.at);
    await E.park({ at: [0.5, 0.03], settle: 600 });
    const look = await E.waitFor('credit_buy', { timeout: 8000 });
    const name = E.find(look.texts, /\S/, ITEM_NAME)?.text.replace(/^[^一-鿿]+/, '') || null;
    if (name !== card.name) E.fail(`opened_${name}_not_${card.name}`);
    const tag = E.find(look.texts, /^-\d+%$/, ITEM_OFF);
    if ((tag ? Number(tag.text.slice(1, -1)) : 0) !== card.off) E.fail(`${name}_dialog_discount_${tag?.text}_list_${card.off}`);
    const price = Number(E.find(await E.ocr(look.frame, ITEM_TOTAL, { scale: 2 }), /^\d+$/)?.text ?? NaN) || null;
    const before = await E.readNumber(look.frame, DIALOG_BALANCE);
    if (price === null || before === null) E.fail(`${name}_price_${price}_balance_${before}_unread`);
    if (price > before) {
      t.note(`${name} (-${card.off}%): ${price} > 信用 ${before}, not bought`);
      await E.click(...CLOSE);
      await E.waitFor('credit_shop', { timeout: 8000 });
      return false;
    }
    E.guardSpend(look, { ignore: ALWAYS.test(name) ? ITEM_INFO : [] });
    const ready = await t.save(look.frame, `buy${index}-ready`);
    const confirm = E.find(look.texts, '确认购买', CONFIRM);
    if (!confirm) E.fail('dialog_without_确认购买');
    await E.click(...E.center(confirm));
    const { look: after, receipt } = await backToShop(t, `buy${index}`);
    const shown = await t.save(after.frame, `buy${index}-after`);
    const now = balance(after);
    if (now !== before - price) E.fail(`${name}_credits_${before}_minus_${price}_read_${now}`);
    t.change({ what: `购买 ${name}`, discount: card.off, price, credits: { before, after: now },
      items: receipt?.items ?? null, frames: [ready, receipt?.frame, shown].filter(Boolean) });
    return true;
  }

  // Refresh once if 信用 and the day's refreshes allow; returns why not otherwise.
  async function refresh(t, look, index) {
    const left = E.find(look.texts, REFRESHES)?.text.match(REFRESHES);
    if (!left) E.fail('refreshes_unread');
    if (Number(left[1]) === 0) return 'no refreshes left today';
    const cost = Number(E.find(await E.ocr(look.frame, REFRESH_COST, { scale: 2 }), /^\d+$/)?.text ?? NaN);
    const before = balance(look);
    if (!cost || before === null) E.fail(`refresh_cost_${cost}_balance_${before}_unread`);
    if (cost > before) return `refresh costs ${cost} > 信用 ${before}`;
    E.guardSpend(look, { ignore: [CARDS] });
    const shown = await t.save(look.frame, `refresh${index}-before`);
    await E.click(...E.center(E.find(look.texts, '立即刷新', REFRESH)));
    const ask = await E.waitFor('credit_refresh', { timeout: 8000 });
    const asked = Number(E.find(ask.texts, REFRESH_ASK).text.match(REFRESH_ASK)[1]);
    if (asked !== cost) E.fail(`refresh_asks_${asked}_button_${cost}`);
    E.guardSpend(ask);
    const confirm = E.find(ask.texts, /^确认/, [0.5, 0.6, 0.2, 0.08]);
    if (!confirm) E.fail('refresh_ask_without_确认');
    const asking = await t.save(ask.frame, `refresh${index}-ask`);
    await E.click(...E.center(confirm));
    const { look: after } = await backToShop(t, `refresh${index}`);
    const frame = await t.save(after.frame, `refresh${index}-after`);
    const now = balance(after);
    const remaining = E.find(after.texts, REFRESHES)?.text.match(REFRESHES);
    if (now !== before - cost) E.fail(`refresh_credits_${before}_minus_${cost}_read_${now}`);
    if (!remaining || Number(remaining[1]) !== Number(left[1]) - 1) E.fail(`refreshes_${left[1]}_after_${remaining?.[1]}`);
    t.change({ what: '立即刷新', cost, credits: { before, after: now },
      refreshes: { before: Number(left[1]), after: Number(remaining[1]) }, frames: [shown, asking, frame] });
    return null;
  }

  E.task('credit_shop', {
    title: '信用点购物',
    start: 'menu',
    async run(t) {
      await E.park();
      const menu = await E.look();
      const entry = E.find(menu.texts, '采购中心');
      if (!entry) E.fail('menu_without_采购中心');
      await E.click(...E.center(entry));
      let look = await E.waitFor(['shop', 'credit_shop'], { timeout: 10000 });
      if (look.screen !== 'credit_shop') {
        const tab = E.find(look.texts, /信用交易所$/, [0.6, 0.06, 0.2, 0.05]);
        if (!tab) E.fail('shop_without_信用交易所');
        await E.click(...E.center(tab));
        look = await E.waitFor('credit_shop', { timeout: 10000 });
      }
      await t.save(look.frame, 'credit-shop');
      await collect(t);

      let bought = 0;
      for (let round = 0; round < 10; round++) {
        const done = new Set();
        for (;;) {
          await E.park({ at: [0.5, 0.03], settle: 400 });
          look = await E.look();
          const listed = cards(look);
          t.note(`round ${round}: ${listed.map(c => `${c.name}${c.off ? `-${c.off}%` : ''}${c.soldOut ? '(售罄)' : ''}`).join(' ')}`);
          const next = listed.find(c => wanted(c) && !done.has(c.key));
          if (!next) break;
          done.add(next.key);
          if (await buy(t, next, ++bought)) continue;
        }
        const why = await refresh(t, look, round + 1);
        if (why) { t.note(why); break; }
      }
      if (!t.changes.length) return t.skip('nothing to collect, buy or refresh');
      return t.pass(`${t.changes.length} change(s)`);
    }
  });
})();
