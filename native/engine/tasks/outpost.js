// 据点交易: menu → 地区建设 → 据点管理, in both regions. Each outpost tab trades one
// selected goods from the region warehouse for 调度券 out of the outpost's reserve.
// Max's rules (2026-10-22): keep at least 100 of every goods item; at every outpost
// sell the goods with the largest stock first (to keep the warehouse from filling),
// switching goods with 更换货品 until the outpost's reserve runs out or no goods has
// enough above 100. The share count is set with the slider and the −/+ buttons:
// dragging reaches the maximum, a press steps by one, holding repeats with
// acceleration (1.5 s ≈ 15, 3 s ≈ 230), so the count is read back after every step.
(() => {
  const E = window.__engine;
  if (!E) return;

  const KEEP = 100;
  // Outposts sitting near 100 would otherwise trade a few units on every run.
  const MIN_SHARES = 50;
  // Goods each region may sell (Max: 四号谷地 2026-10-22, 武陵 2026-10-23, after a run
  // sold 61555 息壤); a region not listed sells any goods. Names must match exactly:
  // 荞愈胶囊 and 优质荞愈胶囊 are different goods, as are 息壤 and 重息壤.
  const ALLOWED = {
    四号谷地: ['精选荞愈胶囊', '高容谷地电池'],
    武陵: ['中容武陵电池', '重息壤', '优质芽针针剂', '灼铜零件'],
  };
  const px = (x, y) => [x / 1920, y / 1080];
  const TABS = [px(290, 118), px(735, 118), px(1205, 118)];
  const SHARES = [0.8, 0.745, 0.12, 0.04];
  const MAX_LABEL = [0.905, 0.78, 0.05, 0.04];
  const STOCK = [0.8, 0.45, 0.17, 0.05];
  const RESERVE = [0.67, 0.23, 0.13, 0.07];
  const PRICE = [0.73, 0.385, 0.07, 0.04];
  const MINUS = px(1461, 862), PLUS = px(1849, 862);
  const THUMB_TRACK = [px(1538, 862), px(1745, 862)];

  E.screen('outposts', look => look.has(/据点$/, [0.05, 0, 0.15, 0.07]) && look.has('本次交易份数'), 74);

  // Every number here sits alone in its region (labels carry no digits).
  const number = (frame, roi) => E.readNumber(frame, roi);
  const shares = async () => number(await E.grab(), SHARES);

  // Bring the share count to exactly `target` (≥ 1).
  async function setShares(target) {
    await E.drag(THUMB_TRACK[0], THUMB_TRACK[1], { ms: 600 });
    await E.sleep(500);
    for (let step = 0; step < 60; step++) {
      const value = await shares();
      if (value === null) E.fail('shares_unread');
      const gap = value - target;
      if (gap === 0) return value;
      const button = gap > 0 ? MINUS : PLUS, far = Math.abs(gap);
      await E.click(...button, { hold: far > 400 ? 2500 : far > 40 ? 1200 : 80 });
      await E.sleep(far > 40 ? 400 : 150);
    }
    E.fail('shares_not_settled');
  }

  // ---- goods list (更换货品) ----------------------------------------------------
  E.screen('goods_list', look => look.has('选择交易货品', [0.1, 0.15, 0.3, 0.07]), 75);
  const LIST_BAR = 1668 / 1920;
  const stockValue = text => {
    const m = text.match(/(\d+(?:\.(\d+))?)(万)?/);
    if (!m) return null;
    const value = parseFloat(m[1]) * (m[3] ? 10000 : 1);
    // "9万" is anything from 85000 to 94999; a plain number is exact.
    const slack = m[3] ? 0.5 * 10 ** (4 - (m[2] || '').length) : 0;
    return { value, slack };
  };
  // Cards visible in one look: name above 本地仓储, stock under it.
  // The selected card also carries a 当前 tag in the name line.
  const readCards = async look => {
    const cards = [];
    for (const label of E.findAll(look.texts, '本地仓储')) {
      const value = E.find(look.texts, /^\d+(\.\d+)?万?$/, [label.x - 0.005, label.y + label.h, 0.065, 0.05]);
      const name = (await E.findAllText(look, /[\u4e00-\u9fa5]{2,}/, [label.x - 0.01, label.y - 0.06, 0.15, 0.05])).find(t => !/当前/.test(t.text));
      const unitPrice = E.find(look.texts, /^\d+/, [label.x + 0.06, label.y + label.h, 0.07, 0.05]);
      const stock = value && stockValue(value.text);
      // Names come with stray leading marks ("［重息壤"); keep the Chinese name only.
      if (name && stock) cards.push({ name: name.text.replace(/^[^\u4e00-\u9fa5]+/, ''), ...stock, text: value.text,
        price: unitPrice ? parseInt(unitPrice.text, 10) : null });
    }
    return cards;
  };
  const scroll = async down => {
    await E.drag([LIST_BAR, down ? 0.3 : 0.65], [LIST_BAR, down ? 0.85 : 0.1], { ms: 700 });
    await E.sleep(900);
    return E.look();
  };

  // Open 更换货品 and select the goods with the largest stock that can sell at least
  // MIN_SHARES, is allowed in `region` and was not tried yet. Returns the chosen card,
  // or null (list closed).
  async function chooseGoods(t, region, label, tried) {
    const open = await E.look();
    const change = await E.findText(open, /(更换|选择)货品/, [0.85, 0.55, 0.15, 0.08]);
    if (!change) E.fail('outpost_without_更换或选择货品');
    await E.click(...E.center(change));
    let look = await E.waitFor('goods_list', { timeout: 10000 });
    const cards = new Map();
    for (const card of await readCards(look)) cards.set(card.name, { ...card, down: false });
    const top = look;
    look = await scroll(true);
    for (const card of await readCards(look)) if (!cards.has(card.name)) cards.set(card.name, { ...card, down: true });
    const ranked = [...cards.values()].sort((a, b) => b.value - a.value);
    t.note(`${label} goods: ${ranked.map(c => `${c.name}=${c.text}`).join(' ')}`);
    const allowed = ALLOWED[region];
    const pick = ranked.find(c => c.value - c.slack - KEEP >= MIN_SHARES && !tried.has(c.name) && (!allowed || allowed.includes(c.name)));
    if (!pick) {
      await t.save(top.frame, `${label}-goods-none`);
      await E.key('Escape');
      await E.waitFor('outposts', { timeout: 10000 });
      return null;
    }
    if (!pick.down) look = await scroll(false);
    // Exact name: "息壤" is also part of "重息壤" (picked the wrong goods 2026-10-22).
    const button = E.find(look.texts, new RegExp(`^[^\u4e00-\u9fa5]*${pick.name}$`));
    if (!button) E.fail(`goods_${pick.name}_not_visible`);
    await E.click(...E.center(button));
    // Selecting a card sometimes opens its item tooltip, which covers 确认 and stays
    // open when the pointer leaves (2026-10-22). Clicking the dialog's empty title
    // bar is tried to close it.
    await E.park({ at: [0.5, 0.185], settle: 600 });
    let confirm = null;
    for (let attempt = 0; attempt < 3 && !confirm; attempt++) {
      if (attempt) {
        await E.click(0.5, 0.185);
        await E.sleep(800);
      }
      look = await E.look();
      await t.save(look.frame, `${label}-goods-${ranked.indexOf(pick) + 1}${attempt ? `-${attempt}` : ''}`);
      // A tooltip repeats the goods name; a card in the third column, second row has
      // its own name where the tooltip's would be (2026-10-23), so count the names.
      const named = E.findAll(look.texts, new RegExp(`^[^\u4e00-\u9fa5]*${pick.name}$`)).length;
      if (named < 2 && !look.has('获取方式')) confirm = await E.findText(look, /^确认$/, [0.7, 0.75, 0.3, 0.12]);
    }
    if (!confirm) E.fail('goods_list_without_确认');
    await E.click(...E.center(confirm));
    await E.waitFor('outposts', { timeout: 10000 });
    return pick;
  }

  // Trade the selected goods down to KEEP. Returns 'traded', 'small' (not enough above
  // KEEP) or 'reserve' (the outpost cannot pay for more).
  async function tradeSelected(t, outpost, label, goods) {
    const look = await E.waitFor('outposts');
    const before = await t.save(look.frame, `${label}-before`);
    const stock = await number(look.frame, STOCK), reserve = await number(look.frame, RESERVE);
    // A lone single-digit price ("+3") may not read; the goods card shows it too.
    const shownPrice = await number(look.frame, PRICE), max = await number(look.frame, MAX_LABEL);
    if (shownPrice !== null && goods?.price != null && shownPrice !== goods.price) E.fail(`${outpost}_price_${shownPrice}_card_${goods.price}`);
    const price = shownPrice ?? goods?.price ?? null;
    if ([stock, price, max].includes(null)) E.fail(`${outpost}_unread_stock_${stock}_price_${price}_max_${max}`);
    // The list's stock must match the warehouse figure, or the wrong goods is selected.
    if (goods && Math.abs(stock - goods.value) > goods.slack + 50) E.fail(`${outpost}_selected_${goods.name}_${goods.text}_but_stock_${stock}`);
    const target = Math.min(max, stock - KEEP);
    if (target < MIN_SHARES) {
      t.note(`${outpost} ${goods?.name || 'current goods'}: below ${MIN_SHARES} to sell (goods ${stock}, tradable now ${max})`);
      return stock - KEEP >= MIN_SHARES ? 'reserve' : 'small';
    }
    await setShares(target);
    const set = await E.look();
    E.guardSpend(set);
    const ready = await t.save(set.frame, `${label}-shares`);
    // The outpost keeps producing 调度券 and goods, so reconcile against this frame.
    const stockReady = await number(set.frame, STOCK), reserveReady = await number(set.frame, RESERVE);
    if (stockReady === null) E.fail(`${outpost}_unread_before_trade`);
    if (stockReady - target < KEEP) E.fail(`${outpost}_would_keep_${stockReady - target}`);
    const trade = await E.findText(set, /^交易$/, [0.8, 0.88, 0.2, 0.1]);
    if (!trade) E.fail(`${outpost}_without_交易`);
    await E.click(...E.center(trade));
    const result = await E.waitFor('reward', { timeout: 10000 });
    const receipt = await t.save(result.frame, `${label}-result`);
    const received = await E.reward.read(result);
    await E.reward.confirm();
    const after = await E.waitFor('outposts', { timeout: 10000 });
    const done = await t.save(after.frame, `${label}-after`);
    const stockAfter = await number(after.frame, STOCK), reserveAfter = await number(after.frame, RESERVE);
    if (stockAfter === null) E.fail(`${outpost}_unread_after`);
    // An emptied reserve shows a lone red "0" that OCR may miss; the receipt and the
    // goods are the strict checks.
    if (reserveAfter === null) t.note(`${outpost}: reserve after trade unread`);
    // Goods drop by the shares plus production meanwhile (赤铜零件 went 100 → 433 in
    // about 2.5 min, 2026-10-22), and the receipt's base tile
    // pays shares × price. The reserve display moves in production ticks (~700 seen
    // 2026-10-22: 180975 − 29×54 = 179409 exactly once, +713 off another time), so it
    // is checked loosely.
    const paid = target * price;
    if (stockAfter < KEEP || stockAfter > stockReady - target + 300) E.fail(`${outpost}_stock_${stockReady}_sold_${target}_read_${stockAfter}`);
    const base = received[0];
    if (!base || (base.count === null && !base.text)) E.fail(`${outpost}_receipt_unread`);
    if (base.count !== null && base.count !== paid) E.fail(`${outpost}_receipt_${base.count}_expected_${paid}`);
    if (base.count === null && Math.abs(parseFloat(base.text) * 10000 - paid) > 10000) E.fail(`${outpost}_receipt_${base.text}_expected_${paid}`);
    if (reserveReady !== null && reserveAfter !== null && (reserveAfter < reserveReady - paid || reserveAfter > reserveReady - paid + 1500))
      E.fail(`${outpost}_reserve_${reserveReady}_minus_${paid}_read_${reserveAfter}`);
    t.change({ what: `${outpost} 据点交易`, goods: goods?.name || 'current', stock: { before: stockReady, after: stockAfter },
      shares: target, price, outpostReserve: { before: reserveReady, after: reserveAfter }, received, frames: [before, ready, receipt, done] });
    return target === max && stockAfter - KEEP >= MIN_SHARES ? 'reserve' : 'traded';
  }

  let outpostCount = 0;
  async function tradeOutpost(t, region, index) {
    await E.click(...TABS[index]);
    await E.sleep(1200);
    const look = await E.waitFor('outposts');
    const outpost = E.find(look.texts, /^[\u4e00-\u9fa5]{3,}$/, [0.15, 0.22, 0.3, 0.08])?.text || `outpost${index + 1}`;
    const n = ++outpostCount;
    const tried = new Set();
    for (let round = 1; round <= 6; round++) {
      const goods = await chooseGoods(t, region, `o${n}r${round}`, tried);
      if (!goods) return;
      tried.add(goods.name);
      const outcome = await tradeSelected(t, outpost, `o${n}r${round}`, goods);
      if (outcome === 'reserve') return;
    }
  }

  E.task('outpost_trading', {
    title: '据点交易',
    start: 'menu',
    async run(t) {
      await E.regions.visit(t, '据点管理', async name => {
        const outposts = await E.waitFor('outposts', { timeout: 10000 });
        for (const [i, [x, y]] of TABS.entries()) {
          if (await E.findText(outposts, /\S{3,}/, [x - 0.05, y - 0.04, 0.2, 0.06]))
            await tradeOutpost(t, name, i);
        }
      });
      if (!t.changes.length) return t.skip('no outpost had goods above 100');
      return t.pass(`traded at ${t.changes.length} outpost(s)`);
    }
  });
})();
