// 仓储节点 · 转交委托: menu → 地区建设 → 仓储节点, in both regions. Each node card
// offers 货物装箱 (or 查看报价 once its box is full): keep the default goods type and
// box (下一步), 填充至满 from the local warehouse, 下一步 to 调度申请, then 快速转交 and
// 确认 hand the delivery to others for an immediate 30% deposit in 调度券; the rest
// (尾款) is claimed later from 我转交的委托, which shows it with a red dot (Max's
// walkthrough 2026-10-31). Never 开始运送: that would leave a delivery on the player.
(() => {
  const E = window.__engine;
  if (!E) return;

  const TABS = [0.05, 0.07, 0.45, 0.08];
  const NODE_BUTTONS = [0.03, 0.76, 0.95, 0.12];
  const NODE_NAMES = [0.03, 0.33, 0.95, 0.06];
  const NEXT = [0.75, 0.87, 0.25, 0.1];
  const FILL = [0.8, 0.2, 0.2, 0.1];
  const CAPACITY = [0.86, 0.11, 0.14, 0.1];
  const QUICK = [0.6, 0.87, 0.2, 0.1];
  const DEPOSIT = [0.82, 0.82, 0.16, 0.07];
  const QUOTE = [0.88, 0.2, 0.1, 0.13];
  const DIALOG_TEXT = [0.2, 0.38, 0.6, 0.08];
  const CONFIRM = [0.5, 0.6, 0.2, 0.1];
  const TRANSFERS = [0.03, 0.25, 0.95, 0.65];
  const STATUS = [0.6, 0.25, 0.19, 0.65];
  const BALANCE_CELL_X = 0.88;

  E.screen('depot', look => look.has('本地仓储节点', TABS) && look.has('我转交的委托', TABS), 74);

  const slug = region => region === '武陵' ? 'wuling' : 'valley';
  const pause = () => E.park({ at: [0.5, 0.03], settle: 400 });
  // The first look that passes `test`; otherwise fail with `what`, or null without it.
  async function until(test, what, tries = 12) {
    for (let i = 0; i < tries; i++) {
      await E.sleep(600);
      await pause();
      const look = await E.look();
      if (await test(look)) return look;
    }
    return what ? E.fail(`${what}_not_shown`) : null;
  }
  // Each tab is told by its own content, not by the tab bar, which every tab shows.
  const SHOWN = {
    本地仓储节点: l => l.has(/节点一览|本地库存上限/),
    我转交的委托: l => l.has('运送状态') && l.has('尾款'),
  };
  const tab = async name => {
    let look = await E.look();
    if (look.screen === 'depot' && SHOWN[name](look)) return look;
    const label = await E.findText(look, name, TABS, { assist: true });
    if (!label) E.fail(`depot_without_${name}`);
    await E.click(...E.center(label));
    return until(l => l.screen === 'depot' && SHOWN[name](l), `tab_${name}`);
  };
  const timedOut = error => { if (error?.kind !== 'timeout') throw error; return null; };
  const isNodeButton = text => ['货物装箱', '查看报价'].some(label => E.sameName(text.replace(/\s/g, ''), label));
  // Handed-over deliveries still listed (waiting for a courier or on the way).
  const listed = async look => (await E.findAllText(look, /已发布|运送中/, STATUS)).length;
  const finished = text => /领取|已送达|已完成|已签收/.test(text) && !/已领取/.test(text);
  // Back to the node list from anywhere inside a node's flow.
  async function backToDepot() {
    for (let i = 0; i < 5; i++) {
      const look = await E.look();
      if (look.screen === 'depot') return tab('本地仓储节点');
      await E.key('Escape');
      await E.sleep(1200);
    }
    E.fail('depot_not_reached_back');
  }

  // 尾款 of finished deliveries: rows in 我转交的委托 that no longer wait or travel.
  // What a finished row shows has not been seen yet; the before frame keeps it.
  async function claim(t, region) {
    let look = await tab('我转交的委托');
    let before = await t.save(look.frame, `${slug(region)}-transfers-before`);
    for (let n = 0; n < 5; n++) {
      const row = (await E.findAllText(look, finished, TRANSFERS))[0];
      if (!row) break;
      await E.click(BALANCE_CELL_X, row.y + row.h / 2);
      const reward = await E.waitFor('reward', { timeout: 6000 }).catch(timedOut);
      if (!reward) {
        await t.save(await E.grab(), `${slug(region)}-claim-nothing-opened`);
        t.note(`${region}: 「${row.text}」 row opened no reward`);
        look = await tab('我转交的委托');
        break;
      }
      const frame = await t.save(reward.frame, `${slug(region)}-balance-reward-${n}`);
      const items = await E.reward.read(reward);
      await E.reward.confirm();
      look = await until(l => l.screen === 'depot' && SHOWN['我转交的委托'](l), 'transfers_after_claim');
      const after = await t.save(look.frame, `${slug(region)}-transfers-after-claim-${n}`);
      t.change({ what: `${region} 尾款`, row: row.text, items, frames: [before, frame, after] });
      before = after;
    }
    t.note(`${region} transfers: ${E.findAll(look.texts, /\S/, TRANSFERS).map(x => x.text).slice(0, 16).join('|')}`);
    return listed(look);
  }

  async function ship(t, region, node, button, index, rowsBefore) {
    const tag = `${slug(region)}-node${index}`;
    await E.click(...E.center(button));
    // 货物装箱 opens the type choice; 查看报价 (box already full) goes to 调度申请.
    let look = await until(l => l.has('选择装箱货物类型') || l.has('报价列表'), `${tag}_cargo`);
    if (look.has('选择装箱货物类型')) {
      const next = await E.findText(look, /下一步/, NEXT, { assist: true });
      if (!next) E.fail(`${tag}_type_without_下一步`);
      await E.click(...E.center(next));
      look = await until(async l => !!await E.findText(l, /填充至满/, FILL), `${tag}_fill`);
      const fill = await E.findText(look, /填充至满/, FILL);
      await E.click(...E.center(fill));
      // Without enough goods the button keeps reading 未达起送量: leave the box unpacked.
      look = await until(async l => !!await E.findText(l, /下一步/, NEXT), null, 6);
      if (!look) { await t.save(await E.grab(), `${tag}-not-filled`); t.note(`${tag}: 填充至满 did not reach the shipping minimum, skipped`); return { look: await backToDepot(), rows: rowsBefore }; }
      const capacity = (await E.ocr(look.frame, CAPACITY)).map(x => x.text).join('');
      await t.save(look.frame, `${tag}-filled`);
      await E.click(...E.center(await E.findText(look, /下一步/, NEXT)));
      look = await until(l => l.has('报价列表') || l.has(/有待运送的货物/), `${tag}_bid`);
      t.note(`${tag}: box filled ${capacity}`);
    }
    if (look.has(/有待运送的货物/)) {
      await t.save(look.frame, `${tag}-ongoing-delivery`);
      t.note(`${tag}: a delivery is still on the player, skipped`);
      return { look: await backToDepot(), rows: rowsBefore };
    }
    const bid = await t.save(look.frame, `${tag}-bid`);
    const cargo = look.texts.find(x => /货箱$/.test(x.text))?.text || null;
    const quote = E.find(look.texts, /万/, QUOTE)?.text || null;
    const listedDeposit = (await E.readNumbers(look.frame, DEPOSIT)).pop() ?? null;
    const quick = await E.findText(look, /快速转交/, QUICK, { assist: true });
    if (!quick) E.fail(`${tag}_bid_without_快速转交`);
    await E.click(...E.center(quick));
    look = await until(l => l.has(/委托他人派送/), `${tag}_transfer_dialog`);
    E.guardSpend(look);
    const dialog = await t.save(look.frame, `${tag}-transfer-dialog`);
    const deposit = Number((await E.ocr(look.frame, DIALOG_TEXT)).map(x => x.text).join('').replace(/[,，\s]/g, '').match(/定金\D*(\d{3,})/)?.[1]) || listedDeposit;
    if (!await E.findText(look, /^确认/, CONFIRM)) E.fail(`${tag}_dialog_without_确认`);
    // The deposit arrives behind a reward screen; the page then shows 我转交的委托.
    // 确认 is pressed while its dialog shows; only a reward screen is clicked away.
    let items = null, rewardFrame = null, other = null;
    look = await until(async l => {
      if (l.screen === 'depot') return true;
      const again = l.has(/委托他人派送/) && await E.findText(l, /^确认/, CONFIRM);
      if (again) await E.click(...E.center(again));
      else if (l.screen === 'reward') {
        if (items === null) {
          rewardFrame = await t.save(l.frame, `${tag}-deposit-reward`);
          items = await E.reward.read(l);
        }
        await E.click(0.5, 0.874);
      } else other ??= await t.save(l.frame, `${tag}-after-confirm`);
      return false;
    }, `${tag}_transfers_after`, 20);
    look = await tab('我转交的委托');
    const after = await t.save(look.frame, `${tag}-transfers-after`);
    // The game shows the change: one more delivery listed as handed over.
    const rows = await listed(look);
    t.change({ what: `${region} ${node} 快速转交`, cargo, quote, deposit, received: items, listed: { before: rowsBefore, after: rows },
      frames: [bid, dialog, rewardFrame, other, after].filter(Boolean) });
    if (rows <= rowsBefore) E.fail(`${tag}_transfer_not_listed_${rowsBefore}_${rows}`);
    await tab('本地仓储节点');
    return { look: await E.look(), rows };
  }

  async function shipRegion(t, region) {
    await until(l => l.screen === 'depot', 'depot');
    let rows = await claim(t, region);
    let look = await tab('本地仓储节点');
    await t.save(look.frame, `${slug(region)}-nodes`);
    // A node is known by the name above its button (by its column when unread).
    const tried = [];
    for (let round = 0; round < 6; round++) {
      const names = (await E.findAllText(look, /\S{2,}/, NODE_NAMES)).filter(n => n.text !== '仓储节点');
      const nodes = (await E.findAllText(look, isNodeButton, NODE_BUTTONS)).map(button => {
        const [cx] = E.center(button);
        const name = names.slice().sort((a, b) => Math.abs(E.center(a)[0] - cx) - Math.abs(E.center(b)[0] - cx))[0];
        return { button, node: name && Math.abs(E.center(name)[0] - cx) < 0.12 ? name.text : `column ${Math.floor(cx * 4)}` };
      }).filter(n => !tried.some(done => E.sameName(done, n.node)));
      if (!nodes.length) break;
      tried.push(nodes[0].node);
      ({ look, rows } = await ship(t, region, nodes[0].node, nodes[0].button, tried.length, rows));
    }
    if (!tried.length) t.note(`${region}: no node offers 货物装箱 (${E.findAll(look.texts, /\S/, NODE_BUTTONS).map(x => x.text).join('|')})`);
  }

  E.task('delivery', {
    title: '仓储节点 · 转交委托',
    start: 'menu',
    async run(t) {
      await E.regions.visit(t, '仓储节点', region => shipRegion(t, region));
      const shipped = t.changes.filter(c => c.what.endsWith('快速转交'));
      const claimed = t.changes.length - shipped.length;
      if (!t.changes.length) return t.skip('no node to pack and no 尾款 to claim');
      return t.pass([shipped.length && `transferred ${shipped.length}: ${shipped.map(c => `${c.what.replace(' 快速转交', '')} 定金 ${c.deposit ?? '?'}`).join(', ')}`,
        claimed && `claimed ${claimed} 尾款`].filter(Boolean).join('; '));
    }
  });
})();
