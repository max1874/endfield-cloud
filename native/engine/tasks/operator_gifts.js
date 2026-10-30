// 赠送干员礼物: gifts go through the 干员联络台 kiosk in the 帝江号's 中央环厅. The map
// teleports to the nearest 协议传送点; from there we walk by the minimap, located on
// MaaEnd's floor plan of the ship, open 干员联络 (F) and summon up to 3 operators at
// once. They walk up and stop a few steps away; each one's talk entry shows once the
// character is close and faces them, so we step toward their name tag, then
// Alt+click the entry: 赠送礼物 opens the gift screen with 今日赠礼可提升的信赖.
// Summoned operators leave after a short stay; whoever was not reached is summoned
// again. Max's rule (GOAL.md): never take an operator's gift (cards with a gift icon
// are skipped); give the 3 lowest-信赖度 operators below 200% one batch each in a
// single confirm: 3 of the best-liked gift, or 30 of the most-stocked one when no
// liked gift is in stock. Clicking a gift tile n times selects n of it. Gifts are
// in-game items. The 3 are per game day: operators done today are kept in the engine's
// store, so a second run that day only makes up the rest.
(() => {
  const E = window.__engine;
  if (!E) return;

  const px = (x, y) => [x / 1920, y / 1080];
  const OPERATORS = 3;
  const LIKED_BATCH = 3;
  const OTHER_BATCH = 30;
  const PROMPTS = [0.6, 0.57, 0.3, 0.2];
  // Vision reads 干 as 千/于 and 台 as 合 on some frames.
  const KIOSK = /[干千于]员联络|联络[台合]/;
  // 干员联络: a 6-column card grid; each card has its 信赖度 under the portrait and a
  // yellow gift icon in its top-left corner when the operator has a gift for us.
  const CARD_X = [888, 1023, 1159, 1295, 1431, 1567];
  const CARD_ROWS = [{ y: 340, trust: 0.377, icon: 318 }, { y: 532, trust: 0.556, icon: 510 }];
  const SORT_BOX = px(1300, 790);
  const ORDER_TOGGLE = px(1490, 790);
  // Gift screen: one row of gift tiles, count under each.
  const GIFT_X = [272, 424, 576, 728, 880, 1032, 1184, 1336, 1488, 1640, 1792];
  const GIFT_Y = 850 / 1080;
  const GIFT_SORT_BOX = px(350, 993);
  const GIFT_CLOSE = px(1848, 42);

  E.screen('contact', look => look.has(/[干千于]员联络$/, [0.12, 0.16, 0.12, 0.05]) && look.has(/确认联络|未选择/, [0.7, 0.78, 0.2, 0.06]), 76);
  // Full-frame OCR can miss the choice pills while the thank-you line shows under them
  // (run 20261030-112453-3d8r); with the 信赖度 dial up, crops of the pills decide.
  const TALK_GIFT = [0.75, 0.55, 0.22, 0.15], TALK_LEAVE = [0.75, 0.65, 0.22, 0.12];
  E.screen('operator_talk', async look => {
    if (look.has(/赠送礼物|收下礼物/, TALK_GIFT) && look.has(/离开/, TALK_LEAVE)) return true;
    if (!look.has(/信赖度/, [0.75, 0.3, 0.22, 0.12])) return false;
    return !!await E.findText(look, /赠送礼物|收下礼物/, TALK_GIFT) && !!await E.findText(look, /离开/, TALK_LEAVE);
  }, 74);
  // A spoken line: the speaker's name and the line at the bottom, waiting for a click.
  // Its corner shows an ESC hint too, which the world screen keys on.
  E.screen('talk_line', look => look.has(/[\u4e00-\u9fff]/, [0.42, 0.79, 0.16, 0.05]) && look.has(/\S{6,}/, [0.08, 0.85, 0.84, 0.07]), 73);
  E.nav.dismiss.talk_line = async () => { await E.click(0.5, 0.6); };
  // OCR misses either anchor on some frames.
  E.screen('gift', look => look.has(/赠送礼物$/, [0, 0, 0.15, 0.06]) || look.has('今日赠礼可提升的信赖', [0.78, 0.35, 0.2, 0.05]) || look.has('赠礼记录', [0.02, 0.8, 0.08, 0.05]), 77);

  const kioskPrompt = async look => await E.findText(look, KIOSK, PROMPTS);
  const percent = text => Number(text.match(/(\d{1,3})%/)[1]);

  // ---- where the player is -------------------------------------------------------
  // The minimap is north up, centered on the player, and half transparent over the
  // scene. Its ring, without the player's arrow at the center, scaled by 0.65 is
  // matched by normalized cross-correlation against MaaEnd's floor plan of the
  // 帝江号 (maps/omv_base01.png; transparent outside the ship). Positions are base
  // map px. Scale measured 2026-10-23: at 0.65 the match scored 0.77 against 0.61
  // for the next place. In the 中央环厅 a position agreed with the kiosk icon's own
  // offset on the minimap; in the long east-west corridor at the teleport anchor
  // (about (156, 190) by the 帝江号 map) it read 6 px west.
  const SHIP = { name: 'omv_base01', scale: 0.65, minimap: [61 / 1920, 66 / 1080, 200 / 1920, 200 / 1080], center: [100, 100.5] };
  const RING = [15, 72];
  let ship = null;
  async function loadShip() {
    if (ship) return ship;
    const url = (window.__engineTemplates || {})[SHIP.name];
    if (!url) E.fail(`template_missing_${SHIP.name}`);
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const d = context.getImageData(0, 0, image.width, image.height).data;
    const n = image.width * image.height, gray = new Float32Array(n), solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      solid[i] = d[i * 4 + 3] > 128 ? 1 : 0;
    }
    return ship = { w: image.width, h: image.height, gray, solid };
  }
  // The ring's pixels, scaled to base map px, relative to the player.
  function ringPixels(frame) {
    const s = SHIP.scale, canvas = E.crop(frame, SHIP.minimap, s);
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    const [cx, cy] = [SHIP.center[0] * s, SHIP.center[1] * s], pixels = [];
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r < RING[0] * s || r > RING[1] * s) continue;
      const i = (y * canvas.width + x) * 4;
      pixels.push([Math.round(x - cx), Math.round(y - cy), 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]]);
    }
    return pixels;
  }
  function correlate(map, pixels, px, py) {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (const [dx, dy, a] of pixels) {
      const x = px + dx, y = py + dy;
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const j = y * map.w + x;
      if (!map.solid[j]) continue;
      const b = map.gray[j];
      n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
    if (n < pixels.length * 0.6) return -1;
    const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    return va < 1 || vb < 1 ? -1 : (sab - sa * sb / n) / Math.sqrt(va * vb);
  }
  // Near a known position a small window is enough; otherwise the whole ship.
  async function locate(near = null) {
    const map = await loadShip();
    const pixels = ringPixels(await E.grab());
    const search = (pts, [x0, x1, y0, y1], step) => {
      let best = { score: -2, x: 0, y: 0 };
      for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
        const score = correlate(map, pts, x, y);
        if (score > best.score) best = { score, x, y };
      }
      return best;
    };
    // The whole ship coarsely (every 2nd px, a quarter of the pixels), then around.
    const area = near ? [near.x - 10, near.x + 10, near.y - 10, near.y + 10]
      : (({ x, y }) => [x - 2, x + 2, y - 2, y + 2])(search(pixels.filter((_, i) => i % 4 === 0), [40, map.w - 40, 60, map.h - 60], 2));
    return search(pixels, area, 1);
  }

  const wrap = deg => ((deg % 360) + 540) % 360 - 180;

  // Pitch the camera down to the stop, then up by a fixed amount: a level view over
  // the character's shoulder, whatever the pitch was.
  async function levelCamera() {
    for (let i = 0; i < 6; i++) { await E.turn(0, 0.3, { ms: 200 }); await E.sleep(100); }
    await E.turn(0, -0.35);
    await E.sleep(400);
  }

  // Walking without turning the camera: W/A/S/D and their pairs move in 8 directions
  // relative to the camera, whose heading stays put. Turning it by mouse was unreliable
  // (its gain changes with window focus, the arrow lags the character), so the
  // camera's heading is inferred from where each move actually went, and every move
  // picks the key pair closest to the wanted bearing. Bearings in degrees, east 0,
  // counterclockwise positive.
  const MOVES = [[0, ['KeyW']], [45, ['KeyW', 'KeyA']], [90, ['KeyA']], [135, ['KeyS', 'KeyA']],
    [180, ['KeyS']], [-135, ['KeyS', 'KeyD']], [-90, ['KeyD']], [-45, ['KeyW', 'KeyD']]];
  let cameraHeading = null;
  const press = (keys, hold) => Promise.all(keys.map(key => E.key(key, { hold })));
  // Move toward `bearing` for `hold` ms; `where()` reads the position (any units with
  // y south) before and after, and the move updates the camera heading. Returns the
  // new position and the distance moved.
  // With the heading unknown, W alone kept walking into the wall the player faced after
  // a talk (run 20261030-113544-tcv6: 25 steps, 0 px), so a probe that does not move
  // tries S, A and D next.
  const PROBES = [MOVES[0], MOVES[4], MOVES[2], MOVES[6]];
  let probe = 0;
  async function step(bearing, hold, where, from) {
    const unknown = cameraHeading === null;
    const [angle, keys] = unknown ? PROBES[probe % PROBES.length]
      : MOVES.reduce((best, m) => Math.abs(wrap(cameraHeading + m[0] - bearing)) < Math.abs(wrap(cameraHeading + best[0] - bearing)) ? m : best);
    await press(keys, hold);
    await E.sleep(250);
    const to = await where(from);
    const moved = Math.hypot(to.x - from.x, to.y - from.y);
    if (moved >= 1.5) cameraHeading = wrap(Math.atan2(-(to.y - from.y), to.x - from.x) * 180 / Math.PI - angle);
    else if (unknown) probe++;
    return { to, moved };
  }

  // Shift toggles between walking and running; something (a stray Shift, the game
  // itself) left the character walking at about a third of the speed (2026-10-23).
  // A trial move tells which; a slow one turns running back on.
  async function ensureRunning() {
    for (let i = 0; i < 2; i++) {
      const from = await locate();
      const { to, moved } = await step(cameraHeading === null ? 0 : cameraHeading, 1000, locate, from);
      E.log(`operator_gifts trial move ${moved.toFixed(1)} px`);
      if (to.score < 0.5 || moved < 0.5 || moved >= 3) return;
      await E.key('ShiftLeft');
      await E.sleep(500);
    }
  }

  // Walk to a point (base map px), locating after every move. A move that does not
  // get anywhere sidesteps to alternating sides.
  async function walkTo(t, target, { tolerance = 2, steps = 25 } = {}) {
    let at = await locate(), side = 1;
    for (let n = 0; n < steps; n++) {
      if (at.score < 0.5) { await t.save(await E.grab(), 'minimap-not-located'); E.fail(`minimap_not_located_${at.score.toFixed(2)}`); }
      const [dx, dy] = [target[0] - at.x, target[1] - at.y];
      const distance = Math.hypot(dx, dy);
      if (distance <= tolerance) return at;
      // About 5 base map px per second once running.
      const bearing = Math.atan2(-dy, dx) * 180 / Math.PI;
      const { to, moved } = await step(bearing, Math.max(300, Math.min(1500, distance * 200)), locate, at);
      E.log(`operator_gifts walk (${target}) step ${n} at=${to.x},${to.y} score=${to.score.toFixed(2)} moved=${moved.toFixed(1)} camera=${Math.round(cameraHeading ?? NaN)}`);
      if (moved < 1.5) { await step(bearing + side * 90, 500, locate, to); side = -side; }
      at = await locate(to);
    }
    await t.save(await E.grab(), 'walk-target-not-reached');
    E.fail(`walk_to_${target.join('_')}_not_reached`);
  }

  // From the teleport anchor a counter stands right to the east: step south of it,
  // east into the 中央环厅, then to a spot south of the kiosk and north from there to
  // its tablet, which takes the prompt from the south. The kiosk's icon sits at
  // about (183, 172) on the ship map (three readings within 1 px, 2026-10-23); the
  // prompt showed about 4 px south of it.
  const ROUTE = [[157, 194], [183, 190], [183, 179]];
  const KIOSK_AT = [183, 172];
  async function walkToKiosk(t) {
    const prompt = async () => !!await kioskPrompt(await E.look());
    if (await prompt()) return;
    await ensureRunning();
    let at = await locate();
    // Inside the hall already: skip the corridor.
    const start = at.x > 168 ? 1 : 0;
    for (const [i, point] of ROUTE.slice(start).entries()) at = await walkTo(t, point, { tolerance: i === ROUTE.length - start - 1 ? 1.5 : 2 });
    // North in short steps, held on the kiosk's column: the prompt's zone is narrow
    // east to west.
    for (let i = 0; i < 6; i++) {
      if (await prompt()) return;
      const off = at.x - KIOSK_AT[0];
      ({ to: at } = await step(90 + Math.max(-40, Math.min(40, off * 20)), 250, locate, at));
      await E.sleep(300);
    }
    // Around the spot, coming back after each try.
    for (const bearing of [45, 135, -45, -135, 0, 180]) {
      if (await prompt()) return;
      ({ to: at } = await step(bearing, 300, locate, at));
      await E.sleep(300);
      if (await prompt()) return;
      ({ to: at } = await step(bearing + 180, 300, locate, at));
    }
    // The minimap fix can be a few px off here: runs 20261027-192412-3g3r and
    // 20261029-203335-p99c ended ~4 px east of the kiosk, in the hall's north doorway,
    // while the walk thought it was on the kiosk's column. Back south onto the prompt's
    // row, then sweep it west and east in short steps (relative moves, so an offset in
    // the fix does not matter).
    ({ to: at } = await step(-90, 400, locate, at));
    for (const [bearing, n] of [[180, 6], [0, 12]]) {
      for (let i = 0; i < n; i++) {
        if (await prompt()) return;
        ({ to: at } = await step(bearing, 200, locate, at));
        await E.sleep(300);
      }
    }
    if (await prompt()) return;
    await t.save(await E.grab(), 'kiosk-not-reached');
    E.fail('kiosk_prompt_not_found');
  }

  async function openContact() {
    await E.key('KeyF');
    const look = await E.waitFor('contact', { timeout: 8000 });
    // Sort by 信赖度, ascending. Cards with a gift icon stay in front either way.
    await E.click(...SORT_BOX);
    await E.sleep(1000);
    let menu = await E.look();
    const trust = await E.findText(menu, '信赖度', [0.6, 0.55, 0.12, 0.2]);
    if (!trust) E.fail('contact_sort_without_信赖度');
    await E.click(...E.center(trust));
    await E.sleep(1000);
    menu = await E.look();
    if (!await E.findText(menu, /升序/, [0.73, 0.7, 0.08, 0.04])) {
      await E.click(...ORDER_TOGGLE);
      await E.sleep(1000);
    }
    await E.park({ at: [0.5, 0.03], settle: 600 });
    return E.look();
  }

  // A card's info button (i, top-left) opens a popup with the operator's name left of
  // 心情; a click on the panel's blank left side closes it.
  async function cardName(card) {
    await E.click((card.x - 48) / 1920, (card.y - 48) / 1080);
    await E.sleep(1200);
    const look = await E.look();
    // The popup opens beside the card, left of the grid's first column.
    const mood = await E.findText(look, /心情/, [0.05, 0.2, 0.75, 0.6]);
    const name = mood && look.texts.filter(t => Math.abs(t.y - mood.y) < 0.015 && t.x < mood.x && NAME.test(t.text))
      .sort((a, b) => b.x - a.x)[0];
    await E.click(0.15, 0.75);
    await E.sleep(800);
    if (!name) E.fail('card_name_unread');
    return name.text.match(NAME)[1];
  }

  // Cards in order (lowest 信赖度 first after the gift-icon ones), without the gift-icon
  // ones and the ones at 200%.
  async function candidates(look) {
    const cards = [];
    for (const row of CARD_ROWS) for (const x of CARD_X) {
      const value = await E.findText(look, /\d{1,3}%/, [x / 1920 - 0.045, row.trust - 0.016, 0.07, 0.032]);
      const [r, g, b] = E.color(look.frame, [(x - 50) / 1920, (row.icon - 8) / 1080, 8 / 1920, 14 / 1080]);
      const gift = r > 170 && g > 150 && b < 110;
      cards.push({ x, y: row.y, trust: value ? percent(value.text) : null, gift });
    }
    return cards.filter(c => !c.gift && c.trust !== null && c.trust < 200);
  }

  // An operator's tag: the name, with a status line (工作中 / 休息中) under it while
  // they work or rest; idle ones show the name alone (噗切娜). Other operators walk
  // the hall too, so tags are matched by the summoned operator's name. An icon before
  // the name may read as one more character. Some names are one character (诀).
  const STATUS = /^.{0,2}(工作中|休息中)$/;
  const NAME = /^[^一-鿿]*([一-鿿]{1,5})$/;
  const tags = look => {
    const found = [];
    for (const n of look.texts) {
      const match = n.text.match(NAME);
      if (!match || STATUS.test(n.text) || n.x < 0.15 || n.y < 0.15 || n.y > 0.75) continue;
      found.push({ name: match[1], cx: E.center(n)[0] });
    }
    return found;
  };
  // Short names must match whole (one shared character matched 赛希 to a stranger);
  // longer ones may lose one character to OCR.
  const sameName = (text, name) => [...name].filter(c => text.includes(c)).length >= (name.length <= 2 ? name.length : name.length - 1);

  // Summoned operators walk up and stop a few steps away; their entry joins the
  // interaction list (right of center, "F <name>" with a chat icon) only once the
  // character is close and faces them. As MaaEnd does, wait for the entry and
  // Alt+click it; to get there, move toward the operator's name tag: its place on
  // screen gives its bearing from the camera's heading (about 90° across the view).
  // With no tag in view, try a few bearings in turn.
  const VIEW = 90;
  const promptFor = async (look, name) => (await E.findAllText(look, /\S/, PROMPTS))
    .find(p => !KIOSK.test(p.text) && p.text.length <= name.length + 3 && sameName(p.text, name)) || null;
  async function reachOperator(t, name) {
    // A talk leaves the camera looking down at the player, which puts name tags above
    // the frame (2026-10-23).
    await levelCamera();
    const around = [0, 90, 180, -90, 45, 135, -135, -45];
    let at = await locate(), tries = 0;
    for (let i = 0; i < 14; i++) {
      const look = await E.look();
      const entry = await promptFor(look, name);
      if (entry) return entry;
      const tag = tags(look).find(tag => tag.name.length <= name.length + 1 && sameName(tag.name, name));
      const bearing = tag && cameraHeading !== null ? cameraHeading - (tag.cx - 0.5) * VIEW
        : (cameraHeading ?? 0) + around[tries++ % around.length];
      const { to } = await step(bearing, tag ? 400 : 250, locate, at);
      at = to;
      await E.sleep(300);
    }
    await t.save(await E.grab(), 'operator-not-reached');
    return null;
  }

  // Alt shows the cursor, which takes clicks on the interaction list. Null when the
  // operator left before the talk opened: summoned operators stay only a short while
  // (佩丽卡 and 弧光 on a tester account, 2026-10-27), and the world is back.
  async function talk(name, entry) {
    await E.altClick(...E.center(entry));
    let look = null;
    for (let i = 0; i < 6; i++) {
      await E.sleep(1200);
      look = await E.look();
      if (look.screen === 'operator_talk') return look;
      // The greeting line hides the choices until clicked.
      if (look.texts.some(t => sameName(t.text, name) && t.y > 0.78 && t.y < 0.85)) await E.click(0.5, 0.6);
    }
    if (look.screen === 'world') return null;
    E.fail(`talk_with_${name}_not_opened`, { look });
  }

  const trustOf = async look => {
    const value = await E.findText(look, /\d{1,3}%/, [0.8, 0.32, 0.09, 0.04]);
    return value ? percent(value.text) : null;
  };

  // Gift screen: sort by 偏好, descending (it opens on 默认 every time); liked gifts
  // come first. A gift is liked when one of its hobby tags is the operator's.
  async function sortByPreference() {
    await E.click(...GIFT_SORT_BOX);
    await E.sleep(1000);
    const menu = await E.look();
    const liked = await E.findText(menu, '偏好', [0.08, 0.76, 0.08, 0.05]);
    if (!liked) E.fail('gift_sort_without_偏好');
    await E.click(...E.center(liked));
    await E.sleep(1000);
    let look = await E.look();
    if (!await E.findText(look, /降序/, [0.26, 0.89, 0.06, 0.04])) {
      await E.click(...px(580, 993));
      await E.sleep(1000);
      look = await E.look();
    }
    return look;
  }
  // Hobby tags: two-character labels (生活, 自然, 公益, 科技, 益智, ...).
  const HOBBIES = /^[\u4e00-\u9fff]{2}$/;
  const hobbies = async (look, roi) => (await E.findAllText(look, HOBBIES, roi)).map(t => t.text);
  const tileCounts = async look => {
    const counts = [];
    for (const x of GIFT_X) counts.push({ x, count: await E.readNumber(look.frame, [x / 1920 - 0.03, 0.82, 0.06, 0.035]) || 0 });
    return counts;
  };
  // Click a tile n times and read the selected count on its corner badge.
  async function selectTile(x, n) {
    for (let i = 0; i < n; i++) { await E.click(x / 1920, GIFT_Y); await E.sleep(i === 0 ? 800 : 150); }
    await E.sleep(600);
    const look = await E.look();
    const badge = await E.readNumber(look.frame, [x / 1920 - 0.035, 0.715, 0.055, 0.03]);
    // The detail card's title, its first line; the card grows upward with its text.
    const title = E.findAll(look.texts, /^[\u4e00-\u9fff]{2,}$/, [0.11, 0.46, 0.14, 0.08]).sort((a, b) => a.y - b.y)[0];
    return { look, badge, gift: title?.text || '?' };
  }

  // One batch: 3 of the best-liked gift in stock, else 30 of the most-stocked gift.
  async function chooseBatch(screen) {
    const look = await sortByPreference();
    const theirs = await hobbies(screen, [0.8, 0.27, 0.13, 0.03]);
    const counts = await tileCounts(look);
    const first = counts.find(c => c.count > 0);
    if (first) {
      const probe = await selectTile(first.x, 1);
      const shared = (await hobbies(probe.look, [0.23, 0.645, 0.12, 0.035])).filter(tag => theirs.includes(tag));
      if (shared.length) {
        const n = Math.min(LIKED_BATCH, first.count);
        const chosen = n > 1 ? await selectTile(first.x, n - 1) : probe;
        return { ...chosen, n, count: first.count, liked: shared };
      }
      const clear = await E.findText(probe.look, '清空选择', [0.65, 0.88, 0.12, 0.06], { assist: true });
      if (!clear) E.fail('gift_without_清空选择');
      await E.click(...E.center(clear));
      await E.sleep(600);
    }
    const most = counts.filter(c => c.count >= OTHER_BATCH).sort((a, b) => b.count - a.count)[0];
    if (!most) return null;
    const chosen = await selectTile(most.x, OTHER_BATCH);
    return { ...chosen, n: OTHER_BATCH, count: most.count, liked: [] };
  }

  // 离开 (or 暂时离开 when the operator offers a gift), then the farewell line.
  async function leaveTalk(talkLook) {
    // The option's icon can read as a leading letter ("G离开").
    const leave = await E.findText(talkLook, /^\W?\w?\s?(暂时)?离开$/, [0.75, 0.65, 0.22, 0.12], { assist: '离开' });
    if (!leave) E.fail('talk_without_离开');
    await E.click(...E.center(leave));
    for (let i = 0; i < 5; i++) {
      const back = await E.waitFor(['talk_line', 'world'], { timeout: 10000 });
      if (back.screen === 'world') return;
      await E.click(0.5, 0.6);
    }
    E.fail('talk_not_closed');
  }

  // Esc does not end a talk.
  E.nav.dismiss.operator_talk = leaveTalk;

  async function giftOperator(t, name, index, talkLook) {
    const before = await trustOf(talkLook);
    const open = await E.findText(talkLook, /赠送礼物/, [0.75, 0.55, 0.22, 0.15]);
    await E.click(...E.center(open));
    const screen = await E.waitFor('gift', { timeout: 8000 });
    const level = (await E.findText(screen, /^[高中低]$/, [0.93, 0.35, 0.06, 0.05]))?.text || null;
    await t.save(screen.frame, `op${index}-gift-screen`);
    // Gifted already today when it is no longer 高.
    let stop = level !== '高' ? `今日赠礼可提升的信赖 ${level ?? 'unread'}` : null;
    const batch = stop ? null : await chooseBatch(screen);
    if (!stop && !batch) stop = `no liked gift and none with ${OTHER_BATCH}+ in stock`;
    if (!stop && batch.badge !== batch.n) stop = `selected ${batch.badge} of ${batch.gift}, wanted ${batch.n}`;
    if (stop) {
      t.note(`${name}: ${stop}; nothing given`);
      E.log(`operator_gifts ${name} skipped: ${stop}`);
      // The gift screen's close button ends the whole talk with a farewell line.
      await E.click(...GIFT_CLOSE);
      for (let i = 0; i < 5; i++) {
        const back = await E.waitFor(['operator_talk', 'talk_line', 'world'], { timeout: 8000 });
        if (back.screen === 'world') break;
        if (back.screen === 'operator_talk') { await leaveTalk(back); break; }
        await E.click(0.5, 0.6);
      }
      return level !== '高' ? 'gifted_today' : 'skipped';
    }
    const shown = await t.save(batch.look.frame, `op${index}-batch`);
    const confirm = await E.findText(batch.look, '确认赠送', [0.8, 0.87, 0.15, 0.07]);
    if (!confirm) E.fail('batch_without_确认赠送');
    await E.click(...E.center(confirm));
    await E.sleep(2500);
    // The thank-you line, then the choices again. A click while the line still types
    // out only completes it (run 20261030-112453-3d8r timed out on the line), so click
    // until the choices are back.
    talkLook = null;
    for (let i = 0; i < 6 && !talkLook; i++) {
      await E.click(0.5, 0.6);
      talkLook = await E.waitFor('operator_talk', { timeout: 3000 }).catch(error => {
        if (error.kind !== 'timeout' || i === 5) throw error;
        return null;
      });
    }
    const after = await trustOf(talkLook);
    const frame = await t.save(talkLook.frame, `op${index}-after`);
    t.change({ what: `${name} ← ${batch.n} ${batch.gift}${batch.liked.length ? ` (likes ${batch.liked.join('、')})` : ''}`,
      gift: { before: batch.count, after: batch.count - batch.n }, trust: { before, after }, frames: [shown, frame] });
    if (after === null || before === null || after <= before) t.note(`${name}: 信赖度 ${before} → ${after}`);
    await leaveTalk(talkLook);
    return 'given';
  }

  E.task('operator_gifts', {
    title: '赠送干员礼物',
    start: 'world',
    async run(t) {
      // Operators gifted today, by an earlier run or by hand (their gift screen no
      // longer shows 高), count toward the day's 3.
      const day = E.gameDay();
      const record = await E.store.get('operator_gifts');
      const done = new Set(record?.day === day ? record.names : []);
      if (done.size >= OPERATORS) return t.skip(`already ${done.size} today: ${[...done].join('、')}`);
      if (done.size) t.note(`gifted earlier today: ${[...done].join('、')}`);
      // Summoned operators leave after a short stay; whoever was not reached by then is
      // summoned again in the next round. Those with nothing to give stay passed over.
      const passed = new Set();
      let talks = 0;
      for (let round = 0; round < 3 && done.size < OPERATORS; round++) {
        if (!await kioskPrompt(await E.look())) {
          // Next to the kiosk already (its prompt needs a move to show), no teleport:
          // on the map the player's arrow would cover the kiosk's icon.
          const at = await locate();
          if (at.score < 0.5 || Math.hypot(at.x - KIOSK_AT[0], at.y - KIOSK_AT[1]) > 25) await E.teleportToContactKiosk(t);
          await walkToKiosk(t);
        }
        const contact = await openContact();
        if (round === 0) await t.save(contact.frame, 'contact');
        // Lowest 信赖度 first, without gift-icon cards, those at 200%, and those done.
        const cards = [];
        for (const card of await candidates(contact)) {
          if (cards.length >= OPERATORS - done.size) break;
          card.name = await cardName(card);
          if (!done.has(card.name) && !passed.has(card.name)) cards.push(card);
        }
        if (!cards.length) {
          await E.key('Escape');
          if (round === 0) return t.skip('no operator below 200% without a gift icon');
          break;
        }
        // Up to 3 at once, as MaaEnd does: each selected card gets a numbered yellow
        // badge in its top-right corner.
        for (const card of cards) { await E.click(card.x / 1920, card.y / 1080); await E.sleep(600); }
        await E.park({ at: [0.5, 0.03], settle: 600 });
        const picked = await E.look();
        for (const card of cards) {
          // The badge's left edge, clear of its digit.
          const [r, g, b] = E.color(picked.frame, [(card.x + 29) / 1920, (card.y - 55) / 1080, 5 / 1920, 18 / 1080]);
          if (!(r > 190 && g > 180 && b < 90)) { await t.save(picked.frame, 'selection'); E.fail(`card_${card.name}_not_selected`); }
        }
        await t.save(picked.frame, `round${round}-selection`);
        const confirm = await E.findText(picked, '确认联络', [0.7, 0.78, 0.2, 0.06], { assist: true });
        if (!confirm) E.fail('contact_without_确认联络');
        await E.click(...E.center(confirm));
        await E.waitFor('world', { timeout: 10000 });
        E.log(`operator_gifts round ${round} summoned ${cards.map(c => `${c.name} ${c.trust}%`).join(', ')}`);
        for (const card of cards) {
          const entry = await reachOperator(t, card.name);
          if (!entry) { t.note(`round ${round}: ${card.name} not reached`); continue; }
          const index = talks++;
          const talkLook = await talk(card.name, entry);
          if (!talkLook) {
            await t.save(await E.grab(), `op${index}-talk-not-opened`);
            t.note(`round ${round}: ${card.name}: talk did not open (left?)`);
            continue;
          }
          // A card's trust icon can OCR as a leading digit (0% → 10%). Identify
          // the speaker by the name on the trust label, not by that percentage.
          const label = await E.findText(talkLook, /的信赖度$/, [0.76, 0.38, 0.2, 0.06]);
          const speaker = label?.text.replace(/的信赖度$/, '') || null;
          const shown = await trustOf(talkLook);
          if (!speaker || !sameName(speaker, card.name)) {
            await t.save(talkLook.frame, `op${index}-other-operator`);
            t.note(`${card.name}: talk name ${speaker ?? 'unread'}, shows ${shown}%, card ${card.trust}%; nothing given`);
            await leaveTalk(talkLook);
            continue;
          }
          if (await giftOperator(t, card.name, index, talkLook) === 'skipped') { passed.add(card.name); continue; }
          done.add(card.name);
          await E.store.set('operator_gifts', { day, names: [...done] });
        }
      }
      if (!t.changes.length) return t.skip(done.size ? `no gift given; done today: ${[...done].join('、')}` : 'no gift given');
      return t.pass(`${t.changes.length} gift(s)`);
    }
  });
})();
