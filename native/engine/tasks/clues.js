// 会客室 · 线索: 总控中枢 (I) → 会客室. Max's rules (2026-10-22): keep 1 of every clue
// type and give every extra one to friends (no limit on the number of gifts), and
// start 线索交流 whenever it can start. A gift pays 信用: 30, or 40 when the friend
// still needs that clue. Selecting a clue sorts the friend list with friends who
// need it first, so the first friend whose 赠予 button is enabled gets the clue.
// 快速赠予重复线索 stayed disabled with a duplicate in stock (2026-10-22).
(() => {
  const E = window.__engine;
  if (!E) return;

  const KEEP = 1;
  const px = (x, y) => [x / 1920, y / 1080];
  const ROOM_ON_MAP = [0.4, 0.15, 0.2, 0.07];
  const SIDE = [0.9, 0.2, 0.1, 0.55];
  const CLUE_LIST = [0.1, 0.15, 0.2, 0.75];
  const LIST_BAR = 549 / 1920;
  // Friend rows on 赠予自有线索: the 赠予 button of row i is centered at
  // (1777, 219 + 156 i); a disabled one is grey instead of white.
  const FRIEND_ROWS = 5;
  const sendButton = i => px(1777, 219 + 156 * i);
  const CREDITS = /(\d+)\s*\/\s*300/;

  E.screen('reception', look => look.has(/会客室$/, [0, 0, 0.2, 0.07]) && look.has('线索库', SIDE), 75);
  E.screen('clue_send', look => look.has('赠予自有线索', [0.05, 0, 0.25, 0.07]), 76);
  // After a 线索交流 ends, entering 会客室 first shows its result: 额外奖励 信用 N, the
  // friends who joined, and 确认 (2026-10-22 16:52).
  E.screen('exchange_done', look => look.has('情报交流结束', [0.3, 0.12, 0.4, 0.08]), 77);
  const closeResult = async look => {
    const confirm = await E.findText(look, /^确认/, [0.4, 0.86, 0.2, 0.08]);
    if (!confirm) E.fail('exchange_done_without_确认');
    await E.click(...E.center(confirm));
  };
  // Esc does not close it; navigation confirms it too.
  E.nav.dismiss.exchange_done = closeResult;

  const credits = look => {
    const m = look.texts.map(t => t.text).join(' ').match(CREDITS);
    return m ? Number(m[1]) : null;
  };

  // Clue cards visible on 赠予自有线索: name and own stock (null when unread; empty
  // types are greyed out and their "0" does not OCR). macOS 27 Vision never reads a lone
  // "1" in the tight digits crop (run 20261029-203335-p99c: 0 of 6 votes) but reads it on
  // the whole "自有库存 N" line, so that line is the fallback.
  const readStockLine = async (frame, name) => {
    for (const scale of [2, 1]) {
      const texts = await E.ocr(frame, [name.x - 0.006, name.y + 0.055, 0.165, 0.04], { scale });
      const hit = texts.find(t => /^\d+$/.test(t.text.trim()) && E.center(t)[0] > name.x + 0.1);
      if (hit) return Number(hit.text.trim());
    }
    return null;
  };
  async function readStock(look) {
    const cards = [];
    for (const name of await E.findAllText(look, /的线索$/, CLUE_LIST)) {
      const stock = await E.readNumber(look.frame, [name.x + 0.125, name.y + 0.058, 0.025, 0.035]) ??
        await readStockLine(look.frame, name);
      // A stray leading quote ("“环塔商会的线索") would not match the card on a later pass.
      cards.push({ name: name.text.replace(/^[^\p{Script=Han}]+/u, ''), at: E.center(name), stock });
    }
    return cards;
  }

  const enabled = (frame, i) => {
    const [x, y] = sendButton(i);
    const [r, g, b] = frame.canvas.getContext('2d', { willReadFrequently: true })
      .getImageData(Math.round(x * frame.width) + 60, Math.round(y * frame.height) + 40, 1, 1).data;
    return r > 200 && g > 200 && b > 200;
  };

  // The selected clue card has a yellow frame; its left edge below the type number
  // reads (253, 237, 0), unselected ones are near black (2026-10-23).
  const selected = (frame, card) => {
    const [r, g, b] = E.color(frame, [68 / 1920, card.at[1] + 66 / 1080, 8 / 1920, 8 / 1080]);
    return r > 200 && g > 190 && b < 80;
  };

  // Give one clue of `card` to the first friend who can take it; returns 信用 paid.
  // A click on a card right after a gift was once lost and 赠予 sent the previously
  // selected clue, its last one (2026-10-23), so 赠予 waits until the card shows selected.
  async function giveOne(t, card, index) {
    let look = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await E.click(...card.at);
      await E.park({ at: [0.5, 0.03], settle: 1200 });
      look = await E.look();
      if (selected(look.frame, card)) break;
      look = null;
    }
    if (!look) { await t.save(await E.grab(), `give${index}-not-selected`); E.fail(`${card.name}_not_selected`); }
    const row = [...Array(FRIEND_ROWS).keys()].find(i => enabled(look.frame, i));
    if (row === undefined) return null;
    const before = credits(look);
    const ready = await t.save(look.frame, `give${index}-ready`);
    await E.click(...sendButton(row));
    const reward = await E.waitFor('reward', { timeout: 10000 });
    const receipt = await t.save(reward.frame, `give${index}-reward`);
    const items = await E.reward.read(reward);
    await E.reward.confirm();
    await E.waitFor('clue_send', { timeout: 10000 });
    await E.park({ at: [0.5, 0.03], settle: 600 });
    const done = await E.look();
    const shown = await t.save(done.frame, `give${index}-after`);
    const paid = items.find(item => item.name === '信用')?.count ?? null;
    if (paid !== 30 && paid !== 40) E.fail(`${card.name}_gift_paid_${JSON.stringify(items)}`);
    const stock = (await readStock(done)).find(c => c.name === card.name)?.stock ?? null;
    if (stock !== card.stock - 1) E.fail(`${card.name}_stock_${card.stock}_after_gift_${stock}`);
    const now = credits(done);
    t.change({ what: `赠予 ${card.name}`, stock: { before: card.stock, after: stock }, paid,
      credits: { before, after: now }, frames: [ready, receipt, shown] });
    if (before !== null && now !== null && now !== Math.min(300, before + paid)) t.note(`信用 ${before} + ${paid} read ${now}`);
    return paid;
  }

  async function giveExtras(t) {
    let look = await E.look();
    const send = await E.findText(look, /^赠予$/, SIDE);
    if (!send) E.fail('reception_without_赠予');
    await E.click(...E.center(send));
    await E.waitFor('clue_send', { timeout: 10000 });
    await E.park({ at: [0.5, 0.03], settle: 1000 });
    let gifts = 0;
    const seen = new Map();
    // The list shows 5–6 of the 7 types; read it at the top, then scrolled down.
    // The list opens at the top; the second pass drags its scrollbar thumb down.
    for (const part of ['top', 'bottom']) {
      if (part === 'bottom') {
        await E.drag([LIST_BAR, 0.28], [LIST_BAR, 0.83], { ms: 700 });
        await E.park({ at: [0.5, 0.03], settle: 1000 });
      }
      look = await E.look();
      await t.save(look.frame, `stock-${part}`);
      for (let card of await readStock(look)) {
        if (seen.has(card.name)) continue;
        seen.set(card.name, card.stock);
        while (card.stock !== null && card.stock > KEEP) {
          const paid = await giveOne(t, card, ++gifts);
          if (paid === null) { t.note(`${card.name}: no friend can take it now`); break; }
          card = { ...card, stock: card.stock - 1 };
          seen.set(card.name, card.stock);
        }
      }
    }
    t.note(`clue stock: ${[...seen].map(([name, stock]) => `${name}=${stock ?? '0/unread'}`).join(' ')}`);
    await E.key('Escape');
    await E.waitFor('reception', { timeout: 10000 });
  }

  // 线索交流: start it when the board allows; while one runs, just record its timer.
  async function exchange(t) {
    await E.park({ at: [0.5, 0.03], settle: 600 });
    let look = await E.look();
    if (look.has('情报交流中')) {
      const timer = E.find(look.texts, /^\d{2}:\d{2}:\d{2}$/, [0.55, 0.8, 0.15, 0.06])?.text;
      return t.note(`线索交流 in progress${timer ? `, ${timer} left` : ''}`);
    }
    const start = E.find(look.texts, '开始线索交流');
    // The board needs all 7 types placed: "集齐所有线索可开展情报交流".
    if (!start && look.has('集齐所有线索')) {
      await t.save(look.frame, 'exchange-board-incomplete');
      return t.note('线索交流 needs all 7 clue types on the board');
    }
    if (!start) {
      await t.save(look.frame, 'exchange-unavailable');
      return t.note('线索交流 neither running nor startable (board incomplete?)');
    }
    const before = await t.save(look.frame, 'exchange-before');
    await E.click(...E.center(start));
    for (let i = 0; i < 20; i++) {
      await E.sleep(500);
      look = await E.look();
      if (look.screen === 'reward') { await E.reward.confirm(); continue; }
      if (look.screen === 'reception' && look.has('情报交流中')) {
        const after = await t.save(look.frame, 'exchange-after');
        return t.change({ what: '开始线索交流', before: 'idle', after: '情报交流中', frames: [before, after] });
      }
    }
    await t.save(look.frame, 'exchange-unknown');
    E.fail(`exchange_not_started_${look.screen}`);
  }

  E.task('clue_exchange', {
    title: '会客室 · 线索赠予与交流',
    start: 'world',
    async run(t) {
      const nexus = await E.openControlNexus(t);
      const room = await E.findText(nexus, /^会客室$/, ROOM_ON_MAP);
      if (!room) E.fail('nexus_without_会客室');
      await E.click(...E.center(room));
      let reception = await E.waitFor(['reception', 'exchange_done'], { timeout: 10000 });
      if (reception.screen === 'exchange_done') {
        const shown = await t.save(reception.frame, 'exchange-done');
        const paid = await E.readNumber(reception.frame, [0.706, 0.305, 0.03, 0.045]);
        await closeResult(reception);
        reception = await E.waitFor('reception', { timeout: 10000 });
        t.change({ what: '线索交流结束', paid, frames: [shown, await t.save(reception.frame, 'exchange-done-after')] });
      }
      await t.save(reception.frame, 'reception');
      await giveExtras(t);
      await exchange(t);
      if (!t.changes.length) return t.skip('no extra clues, 线索交流 running or not startable');
      return t.pass(`${t.changes.length} change(s)`);
    }
  });
})();
