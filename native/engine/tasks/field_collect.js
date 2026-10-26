// Route geometry and map templates were recorded from our own cloud stream.
// A reached waypoint is never collection evidence: the receipt must reconcile
// with the carried item count before this task can pass.
(() => {
  const E = window.__engine;
  if (!E) return;
  const config = { map: 'wuling_base', scale: .65,
    minimap: [61 / 1920, 66 / 1080, 200 / 1920, 200 / 1080],
    center: [100, 100.5], ring: [18, 72] };

  async function readUntil(t, label, predicate) {
    let look;
    for (let i = 0; i < 20; i++) {
      look = await E.look();
      if (await predicate(look)) return look;
      await E.sleep(200);
    }
    await t.save(look.frame, label);
    E.block(`collection_${label}`);
  }
  async function clickText(t, pattern, roi, label) {
    const look = await readUntil(t, label, l => E.find(l.texts, pattern, roi));
    await E.click(...E.center(E.find(look.texts, pattern, roi)));
  }
  async function teleport(t) {
    await E.key('KeyM');
    await clickText(t, /^地区总览$/, [.8, .85, .2, .12], 'map-overview-missing');
    // The overview is a tilted 3D map, so its 应龙关 label is matched from a
    // stream capture. The destination's plain title is checked after the click.
    await clickText(t, /^武陵$/, [.74, .87, .13, .1], 'wuling-region-missing');
    let hit;
    await readUntil(t, 'yinglong-overview-unread', async l => {
      const matches = [];
      for (const template of ['map_yinglong_region', 'map_yinglong_region_active'])
        matches.push(await E.match(l.frame, template, [.54, .32, .07, .06]));
      hit = matches.sort((a, b) => b.score - a.score)[0];
      return hit.score >= .8;
    });
    await E.click(hit.x + hit.w / 2, hit.y + hit.h / 2);
    await readUntil(t, 'yinglong-title-unread', l => E.find(l.texts, /武陵.*应龙关/, [0, 0, .25, .08]));
    const place = await readUntil(t, 'zhiqige-label-unread', l =>
      E.find(l.texts, /^置器阁$/, [.3, .1, .5, .7]));
    const label = E.find(place.texts, /^置器阁$/, [.3, .1, .5, .7]);
    // The player's arrow covers the anchor when already here. Locate its place
    // name instead; verify both the opened panel and the landing position.
    const [x, y] = E.center(label);
    await E.click(x + 8 / 1920, y - 54 / 1080);
    const selection = await readUntil(t, 'anchor-selection-unread', l =>
      E.find(l.texts, /^协议传送点$/, [.65, 0, .35, .85]));
    const choice = E.find(selection.texts, /^协议传送点$/, [.65, .35, .35, .5]);
    if (choice) await E.click(...E.center(choice));
    await readUntil(t, 'anchor-panel-unread', l =>
      E.find(l.texts, /^协议传送点$/, [.72, 0, .28, .2]) &&
      E.find(l.texts, /^应龙关$/, [.72, .08, .28, .12]));
    await t.save(await E.grab(), 'teleport-before');
    await clickText(t, /^传送$/, [.8, .85, .2, .15], 'teleport-button-missing');
    await E.waitFor('world', { timeout: 30000 });
    const at = await E.fieldNavigation.locate(config);
    await t.save(await E.grab(), 'teleport-after');
    if (at.score < .55 || at.margin < .04 || Math.hypot(at.x - 1213, at.y - 776) > 8)
      E.block('collection_wrong_start', { at });
    t.note(`置器阁 start: ${at.x},${at.y}, score=${at.score.toFixed(3)}`);
  }

  E.task('collect_wuling_zhiqige', {
    title: '武陵采集 · 置器阁芽针',
    async run(t) {
      await teleport(t);
      const nav = E.fieldNavigation.navigator(config, { initialOffset: 45 });
      await nav.walk(t, [1215, 772], { tolerance: 1.5, limit: 8,
        onStep: () => E.fieldCollection.prompt('yazhen') });
      if (!await E.fieldCollection.prompt('yazhen')) {
        await t.save(await E.grab(), 'resource-missing');
        E.block('collection_resource_missing');
      }
      const result = await E.fieldCollection.collect(t, 'yazhen');
      return t.pass(`置器阁：芽针 +${result.collected}（携带 ${result.before} → ${result.after}）`);
    }
  });
})();
