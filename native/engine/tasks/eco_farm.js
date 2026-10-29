// 生态农场 · 存仓: map → 地区总览 → 武陵 → an area (祀的画, 武陵城); there the
// 自动农植机 of 祀的画 and of 武陵城 and the 牧场 of 祀的画 each open a side panel with
// their stored produce and 存至武陵仓库, which moves it into the 武陵 warehouse behind
// a 获得奖励 screen. No walking. The 农植机 keeps more
// produce than its 18 slots show: after a store the slots refill from the rest, so it
// is pressed until they are empty (3 presses on 2026-10-29). The 牧场 then reads
// 暂无产出. Seen on run probes 2026-10-29 with the player in 四号谷地.
(() => {
  const E = window.__engine;
  if (!E) return;

  const TITLE = [0, 0, 0.2, 0.06];
  const PANEL_TITLE = [0.72, 0.05, 0.2, 0.06];
  const PANEL_AREA = [0.74, 0.1, 0.15, 0.04];
  const STORE = [0.72, 0.75, 0.26, 0.08];
  const CLOSE = [1848 / 1920, 43 / 1080];
  // Overlapping markers open a list of their names (种植区, 自动农植机, 息壤供电桩, …)
  // right of the click instead of a panel.
  const CANDIDATES = [0.6, 0.3, 0.4, 0.6];
  // Reward names sit under the tiles in up to two rows (counts above them).
  const REWARD_NAMES = [0.1, 0.4, 0.8, 0.35];
  const FARM = { name: '自动农植机', empty: /自动育苗|自动收获/, grid: [0.74, 0.37, 0.24, 0.21] };
  // `near`: where the area's map places the icon (祀的画 measured twice, 2026-10-29).
  // The panel later pans the map, so each facility starts from a fresh area map. The
  // 武陵城 map opens south of its 农植机 (实验作业试点区): drag the map down, which
  // moves it by less than the pointer (~80%), and search the whole map.
  const WHOLE_MAP = [0.1, 0.08, 0.6, 0.8];
  const FACILITIES = [
    { ...FARM, id: 'sis_farm', area: '祀的画', template: 'map_farm', near: [0.43, 0.25, 0.06, 0.08] },
    { id: 'ranch', area: '祀的画', name: '牧场', empty: /暂无产出/, template: 'map_ranch', near: [0.43, 0.29, 0.06, 0.08], grid: [0.74, 0.22, 0.24, 0.22] },
    { ...FARM, id: 'city_farm', area: '武陵城', template: 'map_farm_city', pan: [[0.5, 0.3], [0.5, 0.75]], near: WHOLE_MAP },
  ];

  const OVERVIEW = [0.8, 0.88, 0.18, 0.08];
  const REGION_CARD = [0.8, 0.1, 0.2, 0.06];
  async function openArea(area) {
    await E.nav.to('world', null);
    await E.key('KeyM');
    let look = await E.waitFor('map', { timeout: 10000 });
    let overview = await E.findText(look, '地区总览', OVERVIEW);
    let region = null;
    if (!overview) {
      // The player is on the 帝江号 (operator_gifts teleports to its kiosk; run
      // 20261029-203335-p99c): its map has no 地区总览, and its corner card names the
      // region ("▸▸四号谷地"), as a region map's corner names the 帝江号 (screens.js openMap).
      region = await E.findText(look, /(四号谷地|武陵)$/, REGION_CARD);
      if (region) await E.click(...E.center(region));
    }
    for (let i = 0; !overview && i < 8; i++) {
      await E.sleep(800);
      look = await E.look();
      overview = await E.findText(look, '地区总览', OVERVIEW);
    }
    if (!overview) E.fail(region ? `map_without_地区总览_after_${region.text}` : 'map_without_地区总览');
    await E.click(...E.center(overview));
    await E.sleep(2000);
    look = await E.look();
    const wuling = await E.findText(look, /^武陵$/, [0.74, 0.88, 0.14, 0.07]);
    if (!wuling) E.fail('overview_without_武陵');
    await E.click(...E.center(wuling));
    await E.sleep(2500);
    look = await E.look();
    // Full-frame OCR misses the tilted 武陵城 label; its crop reads it.
    const label = await E.findText(look, area, [0.1, 0.1, 0.85, 0.75]);
    if (!label) E.fail(`overview_without_${area}`);
    // The label sits under its area; click just above the text.
    await E.click(label.x + label.w / 2, label.y - 0.012);
    for (let i = 0; i < 10; i++) {
      await E.sleep(800);
      await E.park({ at: [0.5, 0.97], settle: 200 });
      look = await E.look();
      if (await E.findText(look, new RegExp(`/${area}`), TITLE)) return look;
    }
    E.fail(`map_not_switched_to_${area}`);
  }

  async function openPanel(t, facility) {
    let map = await openArea(facility.area);
    if (facility.pan) {
      await E.drag(...facility.pan, { ms: 700 });
      await E.park({ at: [0.5, 0.97], settle: 1200 });
      map = await E.look();
    }
    const icon = await E.match(map.frame, facility.template, facility.near, { step: facility.pan ? 2 : 1 });
    t.note(`${facility.area}${facility.name} icon score ${icon.score.toFixed(2)} at ${icon.x.toFixed(3)},${icon.y.toFixed(3)}`);
    if (icon.score < 0.6) {
      await t.save(map.frame, `${facility.id}-map-without-icon`);
      E.fail(`${facility.id}_icon_not_found_${icon.score.toFixed(2)}`);
    }
    await E.click(icon.x + icon.w / 2, icon.y + icon.h / 2);
    for (let i = 0; i < 6; i++) {
      await E.sleep(800);
      await E.park({ at: [0.5, 0.97], settle: 200 });
      const look = await E.look();
      if (await E.findText(look, facility.name, PANEL_TITLE) && await E.findText(look, facility.area, PANEL_AREA)) return look;
      // Read the list from its crop: full-frame OCR merged "牧场" with the map label
      // behind it ("听雨窟、牧场"); an entry may keep its icon as a leading character.
      const listed = await E.ocr(look.frame, CANDIDATES, { scale: 2 });
      const entry = listed.find(t => { const text = t.text.replace(/\s/g, ''); return text.endsWith(facility.name) && text.length <= facility.name.length + 2; });
      if (entry) await E.click(...E.center(entry));
      else t.note(`no ${facility.name} entry among: ${listed.map(t => t.text).join('|')}`);
    }
    await t.save((await E.grab()), `${facility.id}-panel-missing`);
    E.fail(`${facility.id}_panel_not_opened`);
  }

  const slots = async (look, facility) => (await E.findAllText(look, /^\d+$/, facility.grid)).map(s => Number(s.text));

  async function store(t, facility) {
    let look = await openPanel(t, facility);
    let counts = await slots(look, facility);
    const before = await t.save(look.frame, `${facility.id}-before`);
    t.note(`${facility.area}${facility.name} before: ${counts.length} slots ${counts.join(',')}${look.has(/仓储格已满/) ? ' (仓储格已满)' : ''}`);
    if (!counts.length) {
      // No counts read: empty only when the panel says so (农植机: its status line
      // instead of 仓储格已满; 牧场: 暂无产出).
      if (!look.has(facility.empty) || look.has(/仓储格已满/)) E.fail(`${facility.id}_counts_unread`);
      await E.click(...CLOSE);
      await E.sleep(1000);
      return null;
    }
    const first = counts;
    const rewards = [];
    for (let press = 0; counts.length; press++) {
      if (press >= 8) E.fail(`${facility.id}_still_holding_after_8_stores`);
      const button = await E.findText(look, '存至武陵仓库', STORE);
      if (!button) E.fail(`${facility.id}_without_存至武陵仓库`);
      await E.click(...E.center(button));
      const reward = await E.waitFor(['reward'], { timeout: 8000 }).catch(async error => {
        // A full 武陵 warehouse has not been seen yet; leave its frame for the record.
        await t.save((await E.look()).frame, `${facility.id}-store-${press}-no-reward`);
        throw error;
      });
      const frame = await t.save(reward.frame, `${facility.id}-reward-${press}`);
      rewards.push({ items: await E.reward.read(reward, REWARD_NAMES), frame });
      await E.reward.confirm();
      await E.sleep(800);
      await E.park({ at: [0.5, 0.97], settle: 300 });
      look = await E.look();
      if (!await E.findText(look, facility.name, PANEL_TITLE)) E.fail(`${facility.id}_panel_gone_after_store`);
      counts = await slots(look, facility);
    }
    const after = await t.save(look.frame, `${facility.id}-after`);
    const status = facility.id === 'ranch' ? look.has(/暂无产出/) : !look.has(/仓储格已满/);
    t.note(`${facility.area}${facility.name} after ${rewards.length} store(s): slots empty, ${facility.id === 'ranch' ? '暂无产出' : '仓储格已满 gone'}=${status}`);
    // The slot read can miss a tile (run 20261029-141245-1nrh read 7 of 8); the reward
    // screens list everything stored.
    const stored = rewards.flatMap(r => r.items).reduce((sum, item) => sum + (item.count ?? 0), 0);
    t.change({ what: `${facility.area}${facility.name} 存至武陵仓库`, before: `${first.length} slots read (${first.reduce((a, b) => a + b, 0)})`,
      after: 'empty', stored, stores: rewards.length, rewards, frames: [before, ...rewards.map(r => r.frame), after] });
    await E.click(...CLOSE);
    await E.sleep(1000);
    return rewards;
  }

  E.task('eco_farm', {
    title: '生态农场 · 存仓',
    start: 'world',
    async run(t) {
      const stored = [];
      for (const facility of FACILITIES) if (await store(t, facility)) stored.push(`${facility.area}${facility.name}`);
      if (!stored.length) return t.skip('自动农植机 (祀的画, 武陵城) and 牧场 hold nothing');
      return t.pass(`stored ${stored.join(', ')} into the 武陵 warehouse`);
    }
  });
})();
