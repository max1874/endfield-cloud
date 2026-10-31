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
  const WULING_TAB = [0.74, 0.88, 0.14, 0.07];
  const hanOnly = text => text.replace(/[^\p{Script=Han}]/gu, '');
  // Where the overview places each area, just above its label (the same spot within a
  // few px in three runs, 2026-10-30). The labels are tilted and OCR misreads them
  // (试陵城, 祀的面; run 20261030-130730-hsw8 found no 武陵城), so the area is clicked
  // at its spot and the map title confirms the switch.
  const AREA_AT = { '祀的画': [1676 / 1920, 262 / 1080], '武陵城': [800 / 1920, 440 / 1080] };
  async function openArea(area) {
    await E.nav.to('world', null);
    await E.key('KeyM');
    let look = await E.waitFor('map', { timeout: 10000 });
    // A region map opens the overview with 地区总览. The 帝江号 map has none (operator_gifts
    // teleports to its kiosk; run 20261029-203335-p99c); its corner card naming the
    // region ("▸▸武陵") opens the overview directly (run 20261030-113903-m7yt).
    const entry = await E.findText(look, '地区总览', OVERVIEW) ?? await E.findText(look, /(四号谷地|武陵)$/, REGION_CARD);
    if (!entry) E.fail('map_without_地区总览');
    await E.click(...E.center(entry));
    let wuling = null;
    for (let i = 0; !wuling && i < 6; i++) {
      await E.sleep(800);
      look = await E.look();
      wuling = await E.findText(look, /^武陵$/, WULING_TAB);
    }
    if (!wuling) E.fail(`overview_without_武陵_after_${entry.text}`);
    await E.click(...E.center(wuling));
    await E.sleep(2500);
    const at = AREA_AT[area];
    await E.click(...at);
    for (let i = 0; i < 10; i++) {
      await E.sleep(800);
      await E.park({ at: [0.5, 0.97], settle: 200 });
      look = await E.look();
      // The title reads 武陵/祀画 for 武陵/祀的画 (run 20261030-125433-ydz3), and its slash
      // may come back full-width (1/武陵／武陵城, run 20261030-130826-t9rm).
      if (await E.findText(look, text => E.sameName(hanOnly(text.match(/\p{Script=Han}\s*[/／]\s*([^/／]+)$/u)?.[1] ?? ''), area), TITLE)) return look;
      // The click can go unanswered (run 20261030-125447-41v8 stayed on the overview);
      // click again, but only while the overview still shows.
      if (i % 3 === 2 && await E.findText(look, /^武陵$/, WULING_TAB)) await E.click(...at);
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
    let icon = await E.match(map.frame, facility.template, facility.near, { step: facility.pan ? 2 : 1 });
    // The area map does not always open at the same spot: after the 祀的画 panels the
    // 武陵城 icon was off the panned view (run 20261030-123647-lw8f, best 0.53). Pan a
    // little further each way and look again.
    const retries = facility.pan ? [[[0.5, 0.35], [0.5, 0.6]], [[0.5, 0.6], [0.5, 0.1]], [[0.5, 0.6], [0.5, 0.35]]] : [];
    for (const drag of retries) {
      if (icon.score >= 0.6) break;
      await E.drag(...drag, { ms: 700 });
      await E.park({ at: [0.5, 0.97], settle: 1200 });
      map = await E.look();
      icon = await E.match(map.frame, facility.template, facility.near, { step: 2 });
    }
    t.note(`${facility.area}${facility.name} icon score ${icon.score.toFixed(2)} at ${icon.x.toFixed(3)},${icon.y.toFixed(3)}`);
    if (icon.score < 0.6) {
      await t.save(map.frame, `${facility.id}-map-without-icon`);
      // Not every account has built every facility: William's has no 武陵城 农植机
      // marker anywhere on the panned map (run 20261030-124421-sy7g). The frame stays as
      // evidence; the other facilities still run.
      E.fail(`${facility.id}_icon_not_found_${icon.score.toFixed(2)}`, { missing: true });
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
      if (entry) { await E.click(...E.center(entry)); continue; }
      t.note(`no ${facility.name} entry among: ${listed.map(t => t.text).join('|')}`);
      // Neither panel nor list: the map had moved under the click (run 20261031-103018-egvg:
      // icon matched at its usual spot, then the map sat ~(+180, -200) px away with no
      // panel). Find the icon where it is now and click it again.
      const moved = await E.match(look.frame, facility.template, WHOLE_MAP, { step: 2 });
      t.note(`${facility.name} icon again: score ${moved.score.toFixed(2)} at ${moved.x.toFixed(3)},${moved.y.toFixed(3)}`);
      if (moved.score >= 0.6) await E.click(moved.x + moved.w / 2, moved.y + moved.h / 2);
    }
    await t.save(map.frame, `${facility.id}-map-clicked`);
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
      const button = await E.findText(look, '存至武陵仓库', STORE, { assist: true });
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
      if (!await E.findText(look, facility.name, PANEL_TITLE)) {
        // The panel closed after a store once, leaving the area map (run 20261030-125404-skva).
        await t.save(look.frame, `${facility.id}-panel-gone-${press}`);
        look = await openPanel(t, facility);
      }
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
      const stored = [], missing = [];
      for (const facility of FACILITIES) {
        const name = `${facility.area}${facility.name}`;
        try {
          if (await store(t, facility)) stored.push(name);
        } catch (error) {
          if (!error?.detail?.missing) throw error;
          t.note(`${name}: not on the map (${error.message}), skipped`);
          missing.push(name);
          await E.nav.to('world', null);
        }
      }
      // Skipped facilities go in the summary: one the map search missed must not read as done.
      const skipped = missing.length ? `; ${missing.join(', ')} not found on the map, skipped` : '';
      if (!stored.length) return t.skip(`nothing to store${skipped}`);
      return t.pass(`stored ${stored.join(', ')} into the 武陵 warehouse${skipped}`);
    }
  });
})();
