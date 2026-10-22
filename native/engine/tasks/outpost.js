// 据点交易: menu → 地区建设 → 据点管理. Each outpost tab trades the selected goods from
// the region warehouse for 调度券 out of the outpost's reserve. Max's rule
// (2026-10-22): keep at least 100 of every goods item, so a trade sells only what is
// above 100. The share count is set with the slider and the −/+ buttons: dragging
// reaches the maximum, a press steps by one, holding repeats with acceleration
// (1.5 s ≈ 15, 3 s ≈ 230), so the count is read back after every step.
(() => {
  const E = window.__engine;
  if (!E) return;

  const KEEP = 100;
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
  E.screen('region', look => look.has('地区建设管理') && look.has('据点管理'), 74);

  const number = async (frame, roi) => {
    const values = await E.readNumbers(frame, roi, { scale: 2 });
    return values.length ? values[values.length - 1] : null;
  };
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

  async function tradeOutpost(t, index) {
    await E.click(...TABS[index]);
    await E.sleep(1200);
    const look = await E.waitFor('outposts');
    const name = E.find(look.texts, /^[\u4e00-\u9fa5]{3,}$/, [0.15, 0.22, 0.3, 0.08])?.text || `outpost${index + 1}`;
    const before = await t.save(look.frame, `outpost${index + 1}-before`);
    const stock = await number(look.frame, STOCK), reserve = await number(look.frame, RESERVE);
    const price = await number(look.frame, PRICE), max = await number(look.frame, MAX_LABEL);
    if ([stock, reserve, price, max].includes(null)) E.fail(`${name}_unread_stock_${stock}_reserve_${reserve}_price_${price}_max_${max}`);
    const target = Math.min(max, stock - KEEP);
    if (target < 1) { t.note(`${name}: nothing to sell (goods ${stock}, keep ${KEEP}, tradable now ${max})`); return; }
    await setShares(target);
    const set = await E.look();
    E.guardSpend(set);
    const ready = await t.save(set.frame, `outpost${index + 1}-shares`);
    // The outpost keeps producing 调度券 and goods, so reconcile against this frame.
    const stockReady = await number(set.frame, STOCK), reserveReady = await number(set.frame, RESERVE);
    if (stockReady === null || reserveReady === null) E.fail(`${name}_unread_before_trade`);
    if (stockReady - target < KEEP) E.fail(`${name}_would_keep_${stockReady - target}`);
    const trade = E.find(set.texts, /^交易$/, [0.8, 0.88, 0.2, 0.1]);
    if (!trade) E.fail(`${name}_without_交易`);
    await E.click(...E.center(trade));
    const result = await E.waitFor('reward', { timeout: 10000 });
    const receipt = await t.save(result.frame, `outpost${index + 1}-result`);
    const received = await E.reward.read(result);
    await E.reward.confirm();
    const after = await E.waitFor('outposts', { timeout: 10000 });
    const done = await t.save(after.frame, `outpost${index + 1}-after`);
    const stockAfter = await number(after.frame, STOCK), reserveAfter = await number(after.frame, RESERVE);
    if (stockAfter === null || reserveAfter === null) E.fail(`${name}_unread_after`);
    // Goods drop by the shares (plus a little production) and the receipt's base tile
    // pays shares × price. The reserve display moves in production ticks (~700 seen
    // 2026-10-22: 180975 − 29×54 = 179409 exactly once, +713 off another time), so it
    // is checked loosely.
    const paid = target * price;
    if (stockAfter < KEEP || stockAfter > stockReady - target + 10) E.fail(`${name}_stock_${stockReady}_sold_${target}_read_${stockAfter}`);
    const base = received[0];
    if (!base || (base.count === null && !base.text)) E.fail(`${name}_receipt_unread`);
    if (base.count !== null && base.count !== paid) E.fail(`${name}_receipt_${base.count}_expected_${paid}`);
    if (base.count === null && Math.abs(parseFloat(base.text) * 10000 - paid) > 10000) E.fail(`${name}_receipt_${base.text}_expected_${paid}`);
    if (reserveAfter < reserveReady - paid || reserveAfter > reserveReady - paid + 1500)
      E.fail(`${name}_reserve_${reserveReady}_minus_${paid}_read_${reserveAfter}`);
    t.change({ what: `${name} 据点交易`, goods: { before: stockReady, after: stockAfter }, shares: target, price,
      outpostReserve: { before: reserveReady, after: reserveAfter }, received, frames: [before, ready, receipt, done] });
  }

  E.task('outpost_trading', {
    title: '据点交易',
    start: 'menu',
    async run(t) {
      await E.park();
      const menu = await E.look();
      const entry = E.find(menu.texts, '地区建设');
      if (!entry) E.fail('menu_without_地区建设');
      await E.click(...E.center(entry));
      const region = await E.waitFor('region', { timeout: 10000 });
      await t.save(region.frame, 'region');
      await E.click(...E.center(E.find(region.texts, '据点管理')));
      const first = await E.waitFor('outposts', { timeout: 10000 });
      const tabs = TABS.filter(([x, y]) => E.find(first.texts, /\S{3,}/, [x - 0.05, y - 0.04, 0.2, 0.06]));
      for (let i = 0; i < tabs.length; i++) await tradeOutpost(t, i);
      if (!t.changes.length) return t.skip('no outpost had goods above 100');
      return t.pass(`traded at ${t.changes.length} outpost(s)`);
    }
  });
})();
