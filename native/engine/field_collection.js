// Resource interactions are accepted only when the prompt, receipt and backpack
// agree. Templates come from this client's stream; unread counts stop the task.
(() => {
  const E = window.__engine;
  if (!E) return;
  const resources = {
    yazhen: { name: '芽针', icon: 'item_yazhen' },
    talos_fungus: { name: '塔罗斯菌', icon: 'item_talos_fungus' }
  };
  const exact = name => new RegExp(`^${name}$`);
  const PROMPTS = [.65, .60, .25, .2], RECEIPTS = [0, .45, .24, .3];
  const resource = id => resources[id] || E.block('collection_resource_unknown');

  async function backpack(t, id, label) {
    const item = resource(id);
    await E.nav.to('world');
    await E.key('KeyB');
    let look = null;
    for (let i = 0; i < 12; i++) {
      look = await E.look();
      if (E.find(look.texts, /^背包$/) && E.find(look.texts, /容量/)) break;
      await E.sleep(200);
    }
    if (!E.find(look.texts, /^背包$/)) E.block('collection_backpack_missing');
    const capacity = E.find(look.texts, /容量\s*\d+\s*\/\s*40/);
    if (!capacity) E.block('collection_capacity_unread');
    const pages = [], candidates = [];
    let selected = false;
    for (let page = 0; page < 2 && !selected; page++) {
      // The inventory retains its scroll position between openings. Read the
      // white thumb before dragging it to the known top/bottom endpoint.
      let frame = await E.grab();
      const thumb = [];
      for (let y = 332; y < 710; y++) {
        const rgb = E.color(frame, [1681 / 1920, y / 1080, 2 / 1920, 1 / 1080]);
        if (Math.min(...rgb) > 210) thumb.push(y);
      }
      if (!thumb.length) E.block('collection_scrollbar_unread');
      await E.drag([1682 / 1920, thumb[Math.floor(thumb.length / 2)] / 1080],
        [1682 / 1920, (page === 0 ? 332 : 710) / 1080]);
      await E.settle({ roi: [.6, .294, .28, .385] });
      frame = await E.grab();
      const matches = [];
      const rows = page === 0 ? [374, 478, 580, 684] : [354, 458, 560, 662];
      for (const y of rows) for (const x of [1205, 1308, 1413, 1515, 1617]) {
        const hit = await E.match(frame, item.icon, [(x - 48) / 1920, (y - 45) / 1080, 96 / 1920, 78 / 1080], { step: 2 });
        matches.push({ ...hit, at: [x / 1920, y / 1080] });
      }
      matches.sort((a, b) => b.score - a.score);
      candidates.push(matches[0].score);
      pages.push(await t.save(frame, `${label}-page-${page + 1}`));
      if (matches[0].score >= .8) {
        await E.click(...matches[0].at);
        selected = true;
      }
    }
    if (!selected) {
      // A zero is provisional until the post-pickup tooltip reads exactly the
      // receipt's quantity. A missed existing stack then fails reconciliation.
      if (candidates.some(score => score >= .6)) E.block(`collection_stock_ambiguous_${id}`);
      await E.nav.to('world');
      return { count: 0, evidence: pages, absent: true };
    }
    for (let i = 0; i < 12; i++) {
      look = await E.look();
      if (E.find(look.texts, exact(item.name), [.55, 0, .45, .15]) && E.find(look.texts, /携带/)) break;
      await E.sleep(150);
    }
    const name = E.find(look.texts, exact(item.name), [.55, 0, .45, .15]);
    const carried = E.find(look.texts, /携带/);
    if (!name || !carried) { await t.save(look.frame, `${label}-tooltip-unread`); E.block('collection_tooltip_unread'); }
    const inline = carried.text.match(/携带\s*(\d+)/);
    const count = inline ? Number(inline[1]) : await E.readNumber(look.frame,
      [carried.x + carried.w, carried.y - .008, Math.min(.07, 1 - carried.x - carried.w), carried.h + .016]);
    const evidence = await t.save(look.frame, label);
    if (count === null) E.block('collection_count_unread');
    await E.nav.to('world');
    return { count, evidence };
  }

  async function prompt(id, frame = null) {
    frame ||= await E.grab();
    return E.find(await E.ocr(frame, PROMPTS, { scale: 1.5 }), exact(resource(id).name));
  }

  async function pickup(t, id) {
    const item = resource(id);
    // A fading previous receipt cannot prove a new interaction.
    for (let i = 0; i < 20; i++) {
      const texts = await E.ocr(await E.grab(), RECEIPTS, { scale: 2 });
      if (!E.find(texts, item.name)) break;
      if (i === 19) E.block('collection_previous_receipt_visible');
      await E.sleep(250);
    }
    let frame, stable = 0;
    for (let i = 0; i < 16; i++) {
      frame = await E.grab();
      stable = await prompt(id, frame) ? stable + 1 : 0;
      if (stable === 2) break;
      await E.sleep(150);
    }
    if (stable < 2) E.block('collection_prompt_missing');
    const before = await t.save(frame, 'resource-prompt');
    await E.key('KeyF');
    for (let i = 0; i < 24; i++) {
      await E.sleep(150);
      frame = await E.grab();
      const texts = await E.ocr(frame, RECEIPTS, { scale: 2 });
      const text = texts.map(x => x.text).join(' ');
      const receipt = text.match(new RegExp(`${item.name}\\s*[×xX]\\s*(\\d+)`));
      if (receipt && Number(receipt[1]) > 0 && E.find(texts, /获得/)) {
        return { name: item.name, quantity: Number(receipt[1]), before, receipt: await t.save(frame, 'resource-receipt') };
      }
    }
    await t.save(frame, 'resource-receipt-unread');
    E.block('collection_receipt_unread');
  }
  async function collect(t, id) {
    const before = await backpack(t, id, 'inventory-before');
    const receipt = await pickup(t, id);
    const after = await backpack(t, id, 'inventory-after');
    if (after.count - before.count !== receipt.quantity)
      E.block('collection_inventory_mismatch', { before, after, receipt });
    const change = { what: resource(id).name, before: before.count, after: after.count,
      collected: receipt.quantity, frames: [before.evidence, receipt.before, receipt.receipt, after.evidence].flat() };
    t.change(change);
    return change;
  }
  E.fieldCollection = { resources, backpack, prompt, pickup, collect };
})();
