// 弹性物资囤货: menu → 地区建设 → 物资调度 → 弹性需求物资, in both regions. Max's rule
// (2026-10-22): every day spend the whole remaining purchase quota (剩余可购买数量,
// e.g. 230/460, +230 per day) on the goods with the lowest price in 市场 today.
// The tab lists 当前拥有 above 市场; the list scrolls only by dragging its empty
// right margin (the scrollbar and wheel do nothing). Opening a 市场 card shows
// 购买物资 with a quantity slider (1 … the quota), 总计支付 and the balance.
(() => {
  const E = window.__engine;
  if (!E) return;

  const px = (x, y) => [x / 1920, y / 1080];
  const QUOTA = /剩余可购买数量\s*(\d+)\s*\/\s*(\d+)/;
  // Empty margin between the cards and the scrollbar.
  const LIST_MARGIN = 1780 / 1920;
  // 购买物资 dialog
  const NAME = [0.37, 0.25, 0.2, 0.05];
  const PRICE = [0.79, 0.335, 0.06, 0.04];
  const OWNED = [0.27, 0.558, 0.05, 0.032];
  const QUANTITY = [0.29, 0.675, 0.05, 0.05];
  const MAX_LABEL = [0.53, 0.68, 0.035, 0.04];
  const TOTAL = [0.757, 0.675, 0.075, 0.05]; // starts right of the currency icon
  const BALANCE = [0.86, 0.02, 0.085, 0.045];
  const SLIDER = [px(798, 755), px(1012, 755)];
  const MINUS = px(722, 755), PLUS = px(1109, 755);

  E.screen('stock_market', look => look.has(/物资调度$/, [0, 0, 0.3, 0.07]) && look.has('弹性需求物资'), 74);
  E.screen('stock_buy', look => look.has('购买物资', [0.14, 0.17, 0.2, 0.06]), 77);
  // A 当前拥有 card opens the same dialog on its 出售 side; a 购买 | 出售 toggle sits
  // top right (tester run 20261027-162543-18ze). Nothing on it is ever pressed but 购买.
  E.screen('stock_sell', look => look.has('出售物资', [0.14, 0.17, 0.2, 0.06]), 77);
  const SIDE_TOGGLE = [0.66, 0.25, 0.18, 0.06];

  const quota = look => {
    const m = look.texts.map(t => t.text).join(' ').match(QUOTA);
    return m ? { left: Number(m[1]), total: Number(m[2]) } : null;
  };

  const scroll = async (down = true) => {
    await E.drag([LIST_MARGIN, down ? 0.85 : 0.3], [LIST_MARGIN, down ? 0.3 : 0.85], { ms: 900 });
    await E.park({ at: [0.5, 0.03], settle: 1200 });
    return E.look();
  };

  // 市场 cards below the 市场 header: name label ending 货组, price box above it.
  async function readMarket(look) {
    const header = await E.findText(look, /^市场$/, [0.05, 0.2, 0.15, 0.8]);
    if (!header) return null;
    const cards = [];
    for (const name of E.findAll(look.texts, /货组$/)) {
      if (name.y < header.y) continue;
      const [cx] = E.center(name);
      // Starts right of the currency icon, which full-frame OCR and wider crops
      // read as a leading "1" (3862 → 13862, 2026-10-22).
      const price = await E.readNumber(look.frame, [cx + 0.014, name.y - 0.062, 0.045, 0.04]);
      cards.push({ name: name.text, price, at: [cx, name.y - 0.15] });
    }
    return cards;
  }

  async function readDialog(look) {
    const read = roi => E.readNumber(look.frame, roi);
    return { name: (await E.findText(look, /货组$/, NAME))?.text || null, price: await read(PRICE), owned: await read(OWNED),
      quantity: await read(QUANTITY), max: await read(MAX_LABEL), total: await read(TOTAL), balance: await read(BALANCE) };
  }

  async function openCard(t, label, card) {
    let look = null;
    // The first card click after an Escape-closed dialog went unanswered (run
    // 20261029-203335-p99c, 武陵), so a missed click is tried once more, but only while
    // the market is still showing: a dialog seen once but not yet stable must not be
    // clicked into.
    for (let attempt = 0; !look; attempt++) {
      await E.click(...card.at);
      await E.park({ at: [0.5, 0.1], settle: 600 });
      look = await E.waitFor(['stock_buy', 'stock_sell'], { timeout: 6000 }).catch(async error => {
        if (error.kind !== 'timeout' || attempt > 0 || error.detail?.look?.screen !== 'stock_market') throw error;
        await t.save(error.detail.look.frame, `${label}-click-missed`);
        return null;
      });
    }
    if (look.screen === 'stock_sell') {
      const buySide = await E.findText(look, /^购买/, SIDE_TOGGLE);
      if (!buySide) E.fail(`${card.name}_sell_dialog_without_购买`, { look });
      await E.click(...E.center(buySide));
      await E.park({ at: [0.5, 0.1], settle: 600 });
      look = await E.waitFor('stock_buy', { timeout: 8000 });
    }
    const dialog = await readDialog(look);
    if (!E.sameName(dialog.name, card.name)) E.fail(`opened_${dialog.name}_not_${card.name}`);
    return { look, dialog };
  }

  // Bring the quantity to the slider's maximum (= the quota left, or what the
  // balance affords) and read it back.
  async function setMax(dialog) {
    await E.drag(...SLIDER, { ms: 600 });
    await E.park({ at: [0.5, 0.1], settle: 500 });
    for (let step = 0; step < 30; step++) {
      const look = await E.look();
      const now = await readDialog(look);
      if (now.quantity === null || now.max === null) E.fail(`quantity_unread_${now.quantity}_max_${now.max}`);
      if (now.quantity === now.max) return { look, now };
      const gap = now.max - now.quantity;
      await E.click(...(gap > 0 ? PLUS : MINUS), { hold: Math.abs(gap) > 40 ? 1200 : 80 });
      await E.park({ at: [0.5, 0.1], settle: 300 });
    }
    E.fail('quantity_not_settled');
  }

  async function buyRegion(t, region) {
    const tag = region === '武陵' ? 'wuling' : 'valley';
    let look = await E.waitFor('stock_market', { timeout: 10000 });
    const tab = E.find(look.texts, '弹性需求物资');
    await E.click(...E.center(tab));
    await E.park({ at: [0.5, 0.03], settle: 1500 });
    look = await E.look();
    const before = quota(look);
    await t.save(look.frame, `${tag}-elastic`);
    if (!before) E.fail(`${region}_quota_unread`);
    if (before.left === 0) { t.note(`${region}: quota already used (0/${before.total})`); return; }

    // Collect the whole 市场 (it may need more than one scroll).
    const market = new Map();
    // One card can read as two names across looks (息壤桥梁货组 and 息壤杯梁货组, run
    // 20261030-123647-lw8f); a name one glyph off an earlier one is the same card.
    const keyOf = name => [...market.keys()].find(k => E.sameName(k, name)) ?? name;
    let shown = null;
    for (let i = 0; i < 4; i++) {
      look = await scroll();
      const cards = await readMarket(look);
      if (!cards) continue;
      const fresh = cards.filter(c => !market.has(c.name));
      // A frame taken mid-scroll can miss a price; never let it replace one read
      // (冬虫夏笋货组 619 ended up unread, 2026-10-23).
      for (const c of cards) { const k = keyOf(c.name); if (market.get(k)?.price == null) market.set(k, { ...c, name: k, price: c.price ?? market.get(k)?.price ?? null }); }
      shown = look;
      if (i > 0 && !fresh.length) break;
    }
    if (!shown) E.fail(`${region}_market_not_reached`);
    look = shown;
    await t.save(look.frame, `${tag}-market`);
    // The currency icon sits closer to a 3-digit price and can read as a leading 1
    // (619 vs 1619 tied, 2026-10-23). A price the list leaves unread is read from the
    // card's 购买物资 dialog, which the purchase checks against anyway. So is a 1xxx
    // price that may be a cheaper xxx (武侠电影货组 976 read as 1976, run
    // 20261029-203335-p99c, which would have bought a 1451 card instead).
    const listed = [...market.values()].map(c => c.price).filter(p => p != null);
    const cheapest = listed.length ? Math.min(...listed) : Infinity;
    const doubtful = p => p == null || (p >= 1000 && p < 2000 && p - 1000 < cheapest);
    for (const c of await readMarket(look) || []) {
      const k = keyOf(c.name);
      if (!doubtful(market.get(k)?.price)) continue;
      const { dialog } = await openCard(t, `${tag}-price`, c);
      await E.key('Escape');
      await E.waitFor('stock_market', { timeout: 8000 });
      await E.park({ at: [0.5, 0.03], settle: 800 });
      t.note(`${k}: price ${dialog.price} read from its dialog (list ${market.get(k)?.price ?? 'unread'})`);
      market.set(k, { ...c, name: k, price: dialog.price ?? market.get(k)?.price ?? null });
    }
    look = await E.look();
    const cards = [...market.values()];
    t.note(`${region} market: ${cards.map(c => `${c.name}=${c.price}`).join(' ')}`);
    if (!cards.length) E.fail(`${region}_market_unread`);
    if (cards.some(c => c.price === null)) E.fail(`${region}_price_unread_${cards.filter(c => c.price === null).map(c => c.name).join('_')}`);
    const pick = cards.reduce((a, b) => (b.price < a.price ? b : a));
    // Card positions come from the last look that showed 市场; the pick must be on it.
    const visible = (await readMarket(look) || []).find(c => E.sameName(c.name, pick.name));
    if (!visible) E.fail(`${pick.name}_not_on_screen`);

    const { dialog } = await openCard(t, tag, visible);
    if (dialog.price !== pick.price) E.fail(`${pick.name}_price_${dialog.price}_list_${pick.price}`);
    // A lone "0" in 拥有 does not OCR; the count is then checked loosely afterwards.
    if (dialog.balance === null) E.fail(`${pick.name}_balance_unread`);
    const { look: set, now } = await setMax(dialog);
    E.guardSpend(set);
    const ready = await t.save(set.frame, `${tag}-buy`);
    if (now.quantity > before.left) E.fail(`${pick.name}_quantity_${now.quantity}_over_quota_${before.left}`);
    if (now.total !== now.quantity * pick.price) E.fail(`${pick.name}_total_${now.total}_expected_${now.quantity * pick.price}`);
    if (now.total > dialog.balance) E.fail(`${pick.name}_total_${now.total}_over_balance_${dialog.balance}`);
    const buy = await E.findText(set, /^购买$/, [0.68, 0.77, 0.25, 0.1]);
    if (!buy) E.fail('dialog_without_购买');
    await E.click(...E.center(buy));

    // Whatever confirms the purchase, end back on the list.
    let after = null, receipt = null;
    for (let i = 0; i < 30 && !after; i++) {
      await E.sleep(500);
      const l = await E.look();
      if (l.screen === 'reward') {
        receipt = { frame: await t.save(l.frame, `${tag}-receipt`), items: await E.reward.read(l) };
        await E.reward.confirm();
      } else if (l.screen === 'stock_market') after = l;
      else if (i === 29) {
        await t.save(l.frame, `${tag}-after-unknown`);
        E.fail(`${pick.name}_after_purchase_${l.screen}`);
      }
    }
    // 购买成功 shows the goods and the count bought.
    const got = receipt?.items.find(item => E.sameName(item.name, pick.name));
    if (!got || got.count !== now.quantity) E.fail(`${pick.name}_receipt_${JSON.stringify(receipt?.items)}`);
    const left = quota(after);
    if (!left) E.fail(`${region}_quota_unread_after`);
    if (left.left !== before.left - now.quantity) E.fail(`${region}_quota_${before.left}_minus_${now.quantity}_read_${left.left}`);
    // Buying adds the goods to 当前拥有 above 市场. Return to the top using
    // only the empty margin, then find its name in either section.
    for (let i = 0; i < 4; i++) {
      after = await scroll(false);
      if (await E.findText(after, /^当前拥有$/, [0.05, 0.23, 0.2, 0.7])) break;
    }
    await t.save(after.frame, `${tag}-owned-list`);
    // A 市场 card opens 购买物资 directly; the 当前拥有 one opens its 出售 side.
    let again = (await readMarket(after) || []).find(c => E.sameName(c.name, pick.name));
    if (!again) {
      const name = (await E.findAllText(after, /货组$/, [0.05, 0.23, 0.85, 0.74])).find(n => E.sameName(n.text, pick.name));
      if (!name) E.fail(`${pick.name}_not_on_screen_after`);
      again = { name: pick.name, at: [E.center(name)[0], name.y - 0.15] };
    }
    const { look: check, dialog: post } = await openCard(t, tag, again);
    const done = await t.save(check.frame, `${tag}-after`);
    await E.key('Escape');
    await E.waitFor('stock_market', { timeout: 8000 });
    if (post.owned === null || (dialog.owned === null ? post.owned < now.quantity : post.owned !== dialog.owned + now.quantity)) E.fail(`${pick.name}_owned_${dialog.owned}_plus_${now.quantity}_read_${post.owned}`);
    // Outposts keep producing 调度券, so the balance may rise a little meanwhile.
    if (post.balance === null || post.balance < dialog.balance - now.total || post.balance > dialog.balance - now.total + 5000)
      E.fail(`${pick.name}_balance_${dialog.balance}_minus_${now.total}_read_${post.balance}`);
    t.change({ what: `${region} 弹性需求物资`, goods: pick.name, price: pick.price, quantity: now.quantity,
      quota: { before: before.left, after: left.left }, owned: { before: dialog.owned, after: post.owned },
      balance: { before: dialog.balance, after: post.balance }, frames: [ready, receipt.frame, done] });
  }

  E.task('stockpile', {
    title: '弹性物资囤货',
    start: 'menu',
    async run(t) {
      await E.regions.visit(t, '物资调度', region => buyRegion(t, region));
      if (!t.changes.length) return t.skip('purchase quota already used in both regions');
      return t.pass(`bought in ${t.changes.length} region(s)`);
    }
  });
})();
