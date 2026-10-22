// 赠送干员礼物: gifts go through the 干员联络台 kiosk in the 帝江号's 中央环厅. The map
// teleports next to it; from there we walk by the minimap, open 干员联络 (F), summon one
// operator, walk to their name tag and talk (F): 赠送礼物 opens the gift screen with
// 今日赠礼可提升的信赖. Summoned operators walk off within about a minute unless
// engaged, so each one is summoned right before the walk.
// Max's rule (GOAL.md): never take an operator's gift (cards with a gift icon are
// skipped); gift the 3 lowest-信赖度 operators below 200%, each with the gifts they like
// best until 今日赠礼可提升的信赖 is no longer 高. Gifts are in-game items.
(() => {
  const E = window.__engine;
  if (!E) return;

  const px = (x, y) => [x / 1920, y / 1080];
  const OPERATORS = 3;
  const MAX_GIFTS = 10;
  const PROMPTS = [0.6, 0.57, 0.3, 0.2];
  const KIOSK = /联络台/;
  // The minimap (top left) is north up and centered on the player's arrow, which
  // points where the character faces; from the teleport anchor it already shows the
  // kiosk. The camera keeps its yaw and pitch through a teleport, so headings are
  // read from the arrow, never assumed. A full camera turn is about 4.7 screen widths
  // at sensitivity 8 (measured 2026-10-22); the arrow corrects what that misses.
  const WHOLE_MAP = [0.1, 0.08, 0.8, 0.84];
  const MINIMAP = [0.035, 0.07, 0.1, 0.17];
  const MINIMAP_CENTER = [161, 166.5];
  const FULL_TURN = 4.7;
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

  // The 帝江号 map shows 总控中枢等级 on top, a region map 地区建设等级 at the bottom
  // left. The map title sits on a busy background and OCR often misses it.
  const SHIP_MAP = [0.4, 0.02, 0.2, 0.06];
  E.screen('map', look => look.has(/总控中枢等级/, SHIP_MAP) || look.has(/地区建设等级/, [0, 0.89, 0.12, 0.05]), 71);
  E.screen('contact', look => look.has(/[干千于]员联络$/, [0.12, 0.16, 0.12, 0.05]) && look.has(/确认联络|未选择/, [0.7, 0.78, 0.2, 0.06]), 76);
  E.screen('operator_talk', look => look.has(/赠送礼物|收下礼物/, [0.75, 0.55, 0.22, 0.15]) && look.has(/离开/, [0.75, 0.65, 0.22, 0.12]), 74);
  // A spoken line: the speaker's name and the line at the bottom, waiting for a click.
  // Its corner shows an ESC hint too, which the world screen keys on.
  E.screen('talk_line', look => look.has(/[\u4e00-\u9fff]{2}/, [0.42, 0.79, 0.16, 0.05]) && look.has(/\S{6,}/, [0.08, 0.85, 0.84, 0.07]), 73);
  E.nav.dismiss.talk_line = async () => { await E.click(0.5, 0.6); };
  // OCR misses either anchor on some frames.
  E.screen('gift', look => look.has(/赠送礼物$/, [0, 0, 0.15, 0.06]) || look.has('今日赠礼可提升的信赖', [0.78, 0.35, 0.2, 0.05]) || look.has('赠礼记录', [0.02, 0.8, 0.08, 0.05]), 77);

  const kioskPrompt = look => E.find(look.texts, KIOSK, PROMPTS);
  const percent = text => Number(text.match(/(\d{2,3})%/)[1]);

  async function openMap() {
    await E.key('KeyM');
    let map = await E.waitFor('map', { timeout: 10000 });
    if (!E.find(map.texts, /总控中枢等级/, SHIP_MAP)) {
      // Another region's map: its corner lists the 帝江号.
      const ship = E.find(map.texts, /帝江号$/, [0.8, 0.1, 0.2, 0.06]);
      if (!ship) E.fail('map_without_帝江号');
      await E.click(...E.center(ship));
      await E.sleep(1500);
      map = await E.waitFor('map', { timeout: 10000 });
      if (!E.find(map.texts, /总控中枢等级/, SHIP_MAP)) E.fail('map_not_switched_to_帝江号');
    }
    return map;
  }

  async function closeMap() {
    await E.key('Escape');
    return E.waitFor('world', { timeout: 10000 });
  }

  // Map → the kiosk's icon → 前往传送 selects the nearest 协议传送点 → 传送. The
  // teleport also resets the camera behind the character, facing east. Near the
  // kiosk the player's arrow covers part of the icon; it still takes the click.
  async function teleport(t) {
    const map = await openMap();
    let icon = await E.match(map.frame, 'map_contact_station', WHOLE_MAP, { step: 2 });
    if (icon.score < 0.7) icon = await E.match(map.frame, 'map_contact_station', [0.44, 0.38, 0.12, 0.24]);
    if (icon.score < 0.25) {
      await t.save(map.frame, 'map-without-kiosk');
      E.fail(`kiosk_icon_not_found_${icon.score.toFixed(2)}`);
    }
    await E.click(icon.x + icon.w / 2, icon.y + icon.h / 2);
    await E.sleep(1500);
    let look = await E.look();
    const go = E.find(look.texts, '前往传送', [0.7, 0.85, 0.15, 0.1]);
    if (!go) { await t.save(look.frame, 'kiosk-panel'); E.fail('kiosk_panel_without_前往传送'); }
    await E.click(...E.center(go));
    await E.sleep(1500);
    look = await E.look();
    const jump = E.find(look.texts, /^传送$/, [0.85, 0.85, 0.15, 0.1]);
    if (!jump) { await t.save(look.frame, 'anchor-panel'); E.fail('anchor_panel_without_传送'); }
    await E.click(...E.center(jump));
    await E.waitFor('world', { timeout: 60000 });
    await E.sleep(1000);
  }

  // The kiosk's offset from the player on the minimap (px, east and south positive).
  async function kioskOffset() {
    const frame = await E.grab();
    const icon = await E.match(frame, 'mini_contact_station', MINIMAP);
    return { score: icon.score, dx: (icon.x + icon.w / 2) * frame.width - MINIMAP_CENTER[0], dy: (icon.y + icon.h / 2) * frame.height - MINIMAP_CENTER[1] };
  }

  // The player's arrow: a white dart, mirror-symmetric about its heading, its tip
  // farther from the centroid than its notched back. Degrees, east 0, counterclockwise
  // positive (north 90); null when the arrow is not visible.
  function arrowHeading(frame) {
    const c = frame.canvas, sx = c.width / 1920, sy = c.height / 1080;
    const [X0, Y0, N] = [145, 150, 33];
    const d = c.getContext('2d', { willReadFrequently: true })
      .getImageData(Math.round(X0 * sx), Math.round(Y0 * sy), Math.round(N * sx), Math.round(N * sy));
    const W = d.width, H = d.height, mask = new Uint8Array(W * H), pts = [];
    const [ox, oy] = [(MINIMAP_CENTER[0] - X0) * sx, (MINIMAP_CENTER[1] - Y0) * sy];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (Math.min(d.data[i], d.data[i + 1], d.data[i + 2]) > 235 && Math.hypot(x - ox, y - oy) <= 11 * sx) {
        mask[y * W + x] = 1;
        pts.push([x, y]);
      }
    }
    if (pts.length < 30) return null;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let axis = null;
    for (let deg = 0; deg < 180; deg += 2) {
      const ux = Math.cos(deg * Math.PI / 180), uy = -Math.sin(deg * Math.PI / 180);
      let hit = 0;
      for (const [x, y] of pts) {
        const px = x - cx, py = y - cy, along = px * ux + py * uy;
        const mx = Math.round(cx + 2 * along * ux - px), my = Math.round(cy + 2 * along * uy - py);
        if (mx >= 0 && my >= 0 && mx < W && my < H && mask[my * W + mx]) hit++;
      }
      if (!axis || hit > axis.hit) axis = { deg, hit, ux, uy };
    }
    let front = -Infinity, back = Infinity;
    for (const [x, y] of pts) {
      const along = (x - cx) * axis.ux + (y - cy) * axis.uy;
      front = Math.max(front, along);
      back = Math.min(back, along);
    }
    return wrap(front >= -back ? axis.deg : axis.deg - 180);
  }
  const wrap = deg => ((deg % 360) + 540) % 360 - 180;

  // W turns the character to the camera's heading, so a short step shows the camera's
  // heading on the arrow; turn the camera by the difference until it matches.
  async function face(target) {
    for (let i = 0; i < 6; i++) {
      await E.key('KeyW', { hold: 200 });
      await E.sleep(300);
      const heading = arrowHeading(await E.grab());
      if (heading === null) continue;
      const diff = wrap(target - heading);
      if (Math.abs(diff) < 8) return;
      await E.turn(-diff / 360 * FULL_TURN);
      await E.sleep(250);
    }
  }

  // From the teleport anchor the corridor runs east into the 中央环厅: head east until
  // the kiosk is due north (or the way is blocked), then straight for the kiosk. A step
  // that does not move the map detours to alternating sides.
  async function walkToKiosk(t) {
    let side = 1, blocked = false, corridor = true, last = Infinity;
    for (let step = 0; step < 40; step++) {
      if (kioskPrompt(await E.look())) return;
      const at = await kioskOffset();
      // Under the player's arrow the icon no longer matches: close; step around below.
      if (at.score < 0.5 && last < 10) break;
      if (at.score < 0.5) { await t.save(await E.grab(), 'minimap-without-kiosk'); E.fail(`kiosk_not_on_minimap_${at.score.toFixed(2)}`); }
      const distance = last = Math.hypot(at.dx, at.dy);
      if (distance < 2) break;
      if (corridor && at.dx < 5) corridor = false;
      let bearing = corridor ? 0 : Math.atan2(-at.dy, at.dx) * 180 / Math.PI;
      if (blocked) bearing += side * 55;
      await face(bearing);
      // About 7 minimap px per second of walking; short steps near the kiosk.
      await E.key('KeyW', { hold: Math.max(150, Math.min(1000, distance * 110)) });
      await E.sleep(250);
      const next = await kioskOffset();
      const moved = Math.hypot(next.dx - at.dx, next.dy - at.dy);
      E.log(`operator_gifts step ${step} bearing=${Math.round(bearing)} dx=${next.dx.toFixed(0)} dy=${next.dy.toFixed(0)} moved=${moved.toFixed(1)}`);
      blocked = moved < 1.5;
      if (blocked) { side = -side; if (corridor && step > 2) corridor = false; }
    }
    // The prompt shows only next to the kiosk's tablet and after a move.
    for (const step of ['KeyS', 'KeyW', 'KeyD', 'KeyA', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyS']) {
      if (kioskPrompt(await E.look())) return;
      await E.key(step, { hold: 300 });
      await E.sleep(400);
    }
    if (kioskPrompt(await E.look())) return;
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
    const trust = E.find(menu.texts, '信赖度', [0.6, 0.55, 0.12, 0.2]);
    if (!trust) E.fail('contact_sort_without_信赖度');
    await E.click(...E.center(trust));
    await E.sleep(1000);
    menu = await E.look();
    if (!E.find(menu.texts, /升序/, [0.73, 0.7, 0.08, 0.04])) {
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
    const mood = E.find(look.texts, /心情/, [0.05, 0.2, 0.75, 0.6]);
    const name = mood && look.texts.filter(t => Math.abs(t.y - mood.y) < 0.015 && t.x < mood.x && NAME.test(t.text))
      .sort((a, b) => b.x - a.x)[0];
    await E.click(0.15, 0.75);
    await E.sleep(800);
    if (!name) E.fail('card_name_unread');
    return name.text.match(NAME)[1];
  }

  // Same-size crops of a card portrait, compared by mean absolute difference.
  // Right of the gift icon, which can appear after a gift.
  const portrait = (frame, x, y) => E.crop(frame, [x / 1920 - 0.012, y / 1080 - 0.035, 0.04, 0.045]);
  const portraitDiff = (a, b) => {
    const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
    const db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
    let sum = 0;
    for (let i = 0; i < da.length; i += 4) sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    return sum / (da.length / 4 * 3);
  };

  // Cards in order (lowest 信赖度 first after the gift-icon ones), without the gift-icon
  // ones, the ones at 200%, and the ones already handled in this run.
  function candidates(look, handled) {
    const cards = [];
    for (const row of CARD_ROWS) for (const x of CARD_X) {
      const value = E.find(look.texts, /\d{2,3}%/, [x / 1920 - 0.045, row.trust - 0.016, 0.07, 0.032]);
      const [r, g, b] = E.color(look.frame, [(x - 50) / 1920, (row.icon - 8) / 1080, 8 / 1920, 14 / 1080]);
      const gift = r > 170 && g > 150 && b < 110;
      cards.push({ x, y: row.y, trust: value ? percent(value.text) : null, gift, face: portrait(look.frame, x, row.y) });
    }
    return cards.filter(c => !c.gift && c.trust !== null && c.trust < 200 && !handled.some(h => portraitDiff(h, c.face) < 12));
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
  // OCR drops or misreads a character now and then: two shared characters (one for
  // names of one or two characters) count as the same name.
  const sameName = (text, name) => [...name].filter(c => text.includes(c)).length >= Math.max(1, Math.min(2, name.length - 1));

  // Turn toward the operator's tag, walk until the prompt "F <name>" shows.
  async function walkToOperator(name) {
    let seen = false, lost = 0, misses = 0, side = 1;
    for (let i = 0; i < 40; i++) {
      const look = await E.look();
      if (E.findAll(look.texts, /\S/, PROMPTS).some(p => p.text.length <= 8 && !KIOSK.test(p.text) && sameName(p.text, name))) return;
      const tag = tags(look).find(t => sameName(t.name, name));
      if (!tag) {
        if (seen && ++misses <= 2) { await E.sleep(300); continue; }
        misses = 0;
        if (++lost > 18) break;
        await E.turn(0.3 * side);
        await E.sleep(450);
        continue;
      }
      lost = 0; misses = 0; side = tag.cx >= 0.5 ? 1 : -1; seen = true;
      if (Math.abs(tag.cx - 0.5) > 0.07) { await E.turn((tag.cx - 0.5) * 1.5); await E.sleep(500); continue; }
      await E.key('KeyW', { hold: 300 });
      await E.sleep(450);
    }
    E.fail(seen ? `operator_${name}_not_reached` : `operator_${name}_not_seen`);
  }

  // F talks to the highlighted prompt; next to the kiosk that can be the kiosk. Close
  // it and scroll the prompt list, then try again.
  async function talk(name) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await E.key('KeyF');
      await E.sleep(2000);
      const look = await E.look();
      if (look.screen === 'contact') {
        await E.key('Escape');
        await E.waitFor('world', { timeout: 8000 });
        await E.wheel(attempt === 0 ? 100 : -100);
        await E.sleep(500);
        continue;
      }
      if (look.texts.some(t => sameName(t.text, name) && t.y > 0.78 && t.y < 0.85)) {
        // The greeting line hides the choices until clicked.
        await E.click(0.5, 0.6);
        return E.waitFor('operator_talk', { timeout: 8000 });
      }
    }
    E.fail(`talk_with_${name}_not_opened`);
  }

  const trustOf = look => {
    const value = E.find(look.texts, /\d{2,3}%/, [0.8, 0.32, 0.09, 0.04]);
    return value ? percent(value.text) : null;
  };

  // Gift screen: sort by 偏好 (best liked first; the screen opens on 默认 every time)
  // and take the first tile we can give.
  async function chooseGift() {
    await E.click(...GIFT_SORT_BOX);
    await E.sleep(1000);
    const menu = await E.look();
    const liked = E.find(menu.texts, '偏好', [0.08, 0.76, 0.08, 0.05]);
    if (!liked) E.fail('gift_sort_without_偏好');
    await E.click(...E.center(liked));
    await E.sleep(1000);
    let look = await E.look();
    if (!E.find(look.texts, /降序/, [0.26, 0.89, 0.06, 0.04])) {
      await E.click(...px(580, 993));
      await E.sleep(1000);
      look = await E.look();
    }
    for (const x of GIFT_X) {
      const count = await E.readNumber(look.frame, [x / 1920 - 0.03, 0.82, 0.06, 0.035]);
      if (!count) continue;
      await E.click(x / 1920, GIFT_Y);
      await E.sleep(800);
      const picked = await E.look();
      const confirm = E.find(picked.texts, '确认赠送', [0.8, 0.87, 0.15, 0.07]);
      if (!confirm) continue;
      const gift = E.find(picked.texts, /\S{2,}/, [0.1, 0.49, 0.12, 0.04])?.text || '?';
      return { gift, count, confirm, look: picked };
    }
    return null;
  }

  // 离开 (or 暂时离开 when the operator offers a gift), then the farewell line.
  async function leaveTalk(talkLook) {
    // The option's icon can read as a leading letter ("G离开").
    const leave = E.find(talkLook.texts, /^\W?\w?\s?(暂时)?离开$/, [0.75, 0.65, 0.22, 0.12]);
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

  async function giftOperator(t, name, index) {
    let talkLook = await E.waitFor('operator_talk', { timeout: 8000 });
    let given = 0;
    for (let n = 0; n < MAX_GIFTS; n++) {
      const before = trustOf(talkLook);
      const open = E.find(talkLook.texts, /赠送礼物/, [0.75, 0.55, 0.22, 0.15]);
      await E.click(...E.center(open));
      let look = await E.waitFor('gift', { timeout: 8000 });
      const level = E.find(look.texts, /^[高中低]$/, [0.93, 0.35, 0.06, 0.05])?.text || null;
      if (n === 0) await t.save(look.frame, `op${index}-gift-screen`);
      // The level previews the selection: the gift that lowers it is still given;
      // the next opening shows the lower level and ends the round.
      let stop = level !== '高' ? `今日赠礼可提升的信赖 ${level ?? 'unread'}` : null;
      const choice = stop ? null : await chooseGift();
      if (!stop && !choice) stop = 'no gift left to give';
      if (stop) {
        t.note(`${name}: ${stop} after ${given} gift(s)`);
        // The gift screen's close button ends the whole talk with a farewell line.
        await E.click(...GIFT_CLOSE);
        for (let i = 0; i < 5; i++) {
          const back = await E.waitFor(['operator_talk', 'talk_line', 'world'], { timeout: 8000 });
          if (back.screen === 'world') return given;
          if (back.screen === 'operator_talk') { talkLook = back; break; }
          await E.click(0.5, 0.6);
        }
        break;
      }
      const shown = await t.save(choice.look.frame, `op${index}-gift${n}`);
      await E.click(...E.center(choice.confirm));
      await E.sleep(2500);
      // The thank-you line, then the choices again.
      await E.click(0.5, 0.6);
      talkLook = await E.waitFor('operator_talk', { timeout: 8000 });
      const after = trustOf(talkLook);
      const frame = await t.save(talkLook.frame, `op${index}-after${n}`);
      t.change({ what: `${name} ← ${choice.gift}`, gift: { before: choice.count, after: choice.count - 1 }, trust: { before, after }, frames: [shown, frame] });
      given++;
    }
    await leaveTalk(talkLook);
    return given;
  }

  E.task('operator_gifts', {
    title: '赠送干员礼物',
    start: 'world',
    async run(t) {
      const handled = [];
      for (let index = 0; index < OPERATORS; index++) {
        if (!kioskPrompt(await E.look())) { await teleport(t); await walkToKiosk(t); }
        const contact = await openContact();
        if (index === 0) await t.save(contact.frame, 'contact');
        const card = candidates(contact, handled)[0];
        if (!card) { t.note('no operator left below 200% without a gift icon'); await E.key('Escape'); break; }
        handled.push(card.face);
        const name = await cardName(card);
        await E.click(card.x / 1920, card.y / 1080);
        await E.sleep(800);
        const picked = await E.look();
        const confirm = E.find(picked.texts, '确认联络', [0.7, 0.78, 0.2, 0.06]);
        if (!confirm) E.fail('card_not_selected');
        await E.click(...E.center(confirm));
        await E.sleep(1000);
        await E.waitFor('world', { timeout: 8000 });
        // Step away from the kiosk so its prompt does not cover the operator's.
        await E.key('KeyS', { hold: 1200 });
        await walkToOperator(name);
        const talkLook = await talk(name);
        // The talk shows the 信赖度; it must be the summoned card's.
        const shown = trustOf(talkLook);
        E.log(`operator_gifts operator ${index} ${name} at ${shown}% card ${card.trust}%`);
        if (shown !== card.trust) {
          await t.save(talkLook.frame, `op${index}-other-operator`);
          await leaveTalk(talkLook);
          E.fail(`talk_shows_${shown}_not_${name}_${card.trust}`);
        }
        await giftOperator(t, name, index);
      }
      if (!t.changes.length) return t.skip('no gift given');
      return t.pass(`${t.changes.length} gift(s)`);
    }
  });
})();
