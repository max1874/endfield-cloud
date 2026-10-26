// Field navigation uses the live north-up minimap and an attributed floor plan.
// Coarse matching narrows the large map before full-resolution correlation. Route
// points must be recorded from our own stream; no MaaEnd route data is consumed.
(() => {
  const E = window.__engine;
  if (!E) return;
  const cache = new Map();
  const wrap = a => ((a % 360) + 540) % 360 - 180;
  const moves = [[0, ['KeyW']], [45, ['KeyW', 'KeyA']], [90, ['KeyA']], [135, ['KeyS', 'KeyA']],
    [180, ['KeyS']], [-135, ['KeyS', 'KeyD']], [-90, ['KeyD']], [-45, ['KeyW', 'KeyD']]];

  function gray(canvas) {
    const { width: w, height: h } = canvas;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const values = new Float32Array(w * h), solid = new Uint8Array(w * h);
    for (let i = 0; i < values.length; i++) {
      values[i] = d[4 * i] * .299 + d[4 * i + 1] * .587 + d[4 * i + 2] * .114;
      solid[i] = d[4 * i + 3] > 128 ? 1 : 0;
    }
    return { w, h, values, solid };
  }
  async function load(name) {
    if (cache.has(name)) return cache.get(name);
    const url = window.__engineTemplates?.[name];
    if (!url) E.fail(`map_missing_${name}`);
    const image = new Image(); image.src = url; await image.decode();
    const make = scale => {
      const c = document.createElement('canvas'); c.width = Math.round(image.width * scale); c.height = Math.round(image.height * scale);
      c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
      return gray(c);
    };
    const result = { fine: make(1), coarse: make(.25) };
    cache.set(name, result); return result;
  }
  function pixels(frame, config, factor) {
    const scale = config.scale * factor;
    const c = E.crop(frame, config.minimap, scale);
    const g = gray(c), [cx, cy] = config.center.map(v => v * scale);
    // White facility glyphs and saturated tracking/teleport markers cover the
    // floor plan. Remove their antialiased outlines too, rather than letting a
    // dense factory's glyphs correlate with an unrelated mountain texture.
    const rgba = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const mask = new Uint8Array(g.w * g.h);
    const padding = Math.max(1, Math.round(3 * scale));
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const i = (y * g.w + x) * 4, r = rgba[i], green = rgba[i + 1], b = rgba[i + 2];
      const icon = Math.min(r, green, b) > 185 || (green > 135 && b > 130 && r < 100) || (r > 170 && green > 145 && b < 100);
      if (!icon) continue;
      for (let dy = -padding; dy <= padding; dy++) for (let dx = -padding; dx <= padding; dx++) {
        if (x + dx >= 0 && x + dx < g.w && y + dy >= 0 && y + dy < g.h) mask[(y + dy) * g.w + x + dx] = 1;
      }
    }
    const points = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r < config.ring[0] * scale || r > config.ring[1] * scale || mask[y * g.w + x]) continue;
      points.push([Math.round(x - cx), Math.round(y - cy), g.values[y * g.w + x]]);
    }
    return points;
  }
  function score(map, points, x, y) {
    let n = 0, a = 0, b = 0, aa = 0, bb = 0, ab = 0;
    for (const [dx, dy, v] of points) {
      const mx = x + dx, my = y + dy;
      if (mx < 0 || my < 0 || mx >= map.w || my >= map.h) continue;
      const i = my * map.w + mx;
      if (!map.solid[i]) continue;
      const u = map.values[i]; n++; a += v; b += u; aa += v * v; bb += u * u; ab += v * u;
    }
    if (n < points.length * .7) return -1;
    const va = aa - a * a / n, vb = bb - b * b / n;
    return va < 1 || vb < 1 ? -1 : (ab - a * b / n) / Math.sqrt(va * vb);
  }
  async function search(map, points, area, step, count = 1, separation = 0) {
    let best = [];
    const [x0, x1, y0, y1] = area.map(Math.round);
    for (let y = Math.max(0, y0); y <= Math.min(map.h - 1, y1); y += step) {
      if ((y - Math.max(0, y0)) % (step * 32) === 0) await E.sleep(0);
      for (let x = Math.max(0, x0); x <= Math.min(map.w - 1, x1); x += step) {
        const s = score(map, points, x, y);
        if (best.length === count && s <= best[best.length - 1].score) continue;
        const close = best.find(p => Math.hypot(p.x - x, p.y - y) <= separation);
        if (close && close.score >= s) continue;
        best = best.filter(p => Math.hypot(p.x - x, p.y - y) > separation);
        best.push({ x, y, score: s }); best.sort((a, b) => b.score - a.score); best.length = Math.min(best.length, count);
      }
    }
    return best;
  }
  async function locate(config, { near = null, radius = 28, frame = null } = {}) {
    frame ||= await E.grab();
    const map = await load(config.map), fine = pixels(frame, config, 1);
    if (near) {
      const [at] = await search(map.fine, fine, [near.x - radius, near.x + radius, near.y - radius, near.y + radius], 1);
      return { ...at, time: frame.time, local: true };
    }
    const coarse = pixels(frame, config, .25);
    const candidates = await search(map.coarse, coarse, [0, map.coarse.w - 1, 0, map.coarse.h - 1], 2, 8, 10);
    const refined = [];
    for (const p of candidates) {
      const [at] = await search(map.fine, fine, [p.x * 4 - 8, p.x * 4 + 8, p.y * 4 - 8, p.y * 4 + 8], 1);
      if (at) refined.push(at);
    }
    refined.sort((a, b) => b.score - a.score);
    if (!refined.length) E.fail('minimap_no_match');
    return { ...refined[0], margin: refined.length > 1 ? refined[0].score - refined[1].score : null, time: frame.time, local: false };
  }

  // Each navigator owns its heading estimate: teleporting/restarting invalidates it.
  function navigator(config, { initialOffset = 0 } = {}) {
    let heading = null, lastPosition = null;
    const good = at => at && at.score >= .55 && (at.local || at.margin >= .04);
    async function position(near = null) {
      const at = await locate(config, { near: near || lastPosition });
      if (!good(at)) E.block(`field_position_uncertain_${at.score.toFixed(2)}`, { position: at });
      lastPosition = at;
      return at;
    }
    async function step(bearing, hold, from) {
      if (!good(from)) E.block('field_move_without_position');
      const [offset, keys] = heading === null ? moves.find(m => m[0] === initialOffset) || moves[0] : moves.reduce((a, b) =>
        Math.abs(wrap(heading + b[0] - bearing)) < Math.abs(wrap(heading + a[0] - bearing)) ? b : a);
      await Promise.all(keys.map(code => E.key(code, { hold: Math.min(1000, hold) })));
      await E.sleep(250);
      const at = await position(from), moved = Math.hypot(at.x - from.x, at.y - from.y);
      if (moved > 15) E.block('field_position_jump', { from, at, moved });
      if (moved >= 3) {
        const observed = wrap(Math.atan2(from.y - at.y, at.x - from.x) * 180 / Math.PI - offset);
        // Sliding along a wall changes displacement, not camera heading. Reject
        // that outlier so the next step does not steer in the opposite direction.
        if (heading === null) heading = observed;
        else if (Math.abs(wrap(observed - heading)) <= 30) heading = wrap(heading + .2 * wrap(observed - heading));
      }
      E.log('field step', { from, at, moved, heading, keys });
      return { at, moved };
    }
    async function walk(t, target, { tolerance = 3, limit = 50, onStep = null } = {}) {
      let at = await position(), progressStart = at, progressSteps = 0;
      for (let i = 0; i < limit; i++) {
        const distance = Math.hypot(target[0] - at.x, target[1] - at.y);
        if (distance <= tolerance) return at;
        if (onStep && await onStep(at)) return at;
        const bearing = Math.atan2(at.y - target[1], target[0] - at.x) * 180 / Math.PI;
        const next = await step(bearing, Math.max(200, Math.min(900, distance * 100)), at);
        at = next.at;
        if (onStep && await onStep(at)) return at;
        // Near a waypoint a short hold may move only one map pixel. Measure
        // accumulated displacement rather than calling three real steps a stall.
        if (++progressSteps === 3) {
          if (Math.hypot(at.x - progressStart.x, at.y - progressStart.y) < 1.5) {
            await t.save(await E.grab(), 'field-movement-blocked');
            E.block('field_movement_blocked');
          }
          progressStart = at; progressSteps = 0;
        }
      }
      E.block('field_waypoint_not_reached');
    }
    return { position, step, walk, reset: () => { heading = null; lastPosition = null; } };
  }
  E.fieldNavigation = { locate, navigator };
})();
