// Automation engine core. Runs in the "endfield-engine" content world (native/engine.m):
// it shares the DOM with the cloud page, so input events dispatched on the video element
// reach the SDK, while page scripts cannot reach the engine.
//
// Coordinates are normalized to the video frame (0..1). The viewport is locked to
// 1280x720 (native/viewport.m), so the game's layout is fixed; see AGENTS.md.
(() => {
  if (window.top !== window || location.origin !== 'https://endfield.hypergryph.com' ||
      !/^\/cloud(?:\/|$)/.test(location.pathname) || window.__engine) return;

  const E = window.__engine = { screens: [], tasks: new Map() };
  const bridge = message => window.webkit.messageHandlers.endfieldEngine.postMessage(message);

  // ---- errors and stopping -------------------------------------------------------
  // `kind` becomes the task verdict: stopped (user or menu), blocked (a rule forbids
  // continuing), timeout (expected screen never appeared), failed (anything else).
  class EngineError extends Error {
    constructor(kind, message, detail) { super(message); this.kind = kind; this.detail = detail; }
  }
  E.EngineError = EngineError;
  E.fail = (message, detail) => { throw new EngineError('failed', message, detail); };
  E.block = (message, detail) => { throw new EngineError('blocked', message, detail); };

  // A run can be stopped (结束, menu 结束运行) or paused (接管 only, Max 2026-10-23: real
  // input in the game, such as a trackpad scroll over the inactive window, paused runs
  // nobody meant to pause, so input no longer stops or pauses anything). A pause aborts
  // the current step like a stop; the runner then holds until 继续 (the interrupted
  // task starts over) or 结束.
  let abort = null, waiting = null;
  E.begin = () => { abort = new AbortController(); return abort.signal; };
  E.end = () => { abort = null; waiting?.('end'); };
  E.stop = reason => { if (waiting) waiting('end'); else abort?.abort(reason || 'stopped_by_menu'); };
  E.pause = reason => { if (abort && !waiting && !abort.signal.aborted) abort.abort(`pause:${reason}`); };
  E.isPause = error => error instanceof EngineError && error.kind === 'stopped' && error.message.startsWith('pause:');
  // Resolves true on 继续 (with a fresh abort signal), false on 结束.
  E.hold = () => new Promise(resolve => {
    waiting = choice => { waiting = null; if (choice === 'continue') E.begin(); resolve(choice === 'continue'); };
  });
  E.resume = () => waiting?.('continue');
  E.paused = () => !!waiting;
  E.running = () => !!abort;
  E.check = () => {
    if (abort?.signal.aborted) throw new EngineError('stopped', String(abort.signal.reason));
  };

  E.sleep = ms => new Promise((resolve, reject) => {
    E.check();
    const timer = setTimeout(() => { abort?.signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new EngineError('stopped', String(abort.signal.reason))); };
    abort?.signal.addEventListener('abort', onAbort, { once: true });
  });

  E.log = (...parts) => bridge({ op: 'log', text: parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ') }).catch(() => {});
  E.status = text => bridge({ op: 'status', text }).catch(() => {});
  // Small JSON state kept across runs, next to the run directories.
  E.store = {
    async get(name) { const text = await bridge({ op: 'load', path: `state/${name}.json` }); return text ? JSON.parse(text) : null; },
    set: (name, value) => bridge({ op: 'save', path: `state/${name}.json`, text: JSON.stringify(value, null, 2) }),
  };
  // The game day: daily resets come at 04:00 server time (UTC+8).
  E.gameDay = () => new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);

  // ---- stream and frames ---------------------------------------------------------
  E.video = () => {
    const v = document.getElementById('WelinkGameVideo');
    if (!(v instanceof HTMLVideoElement) || v.readyState < 2 || !v.videoWidth)
      throw new EngineError('failed', 'stream_not_ready');
    return v;
  };
  // Recognition assumes the locked layout; refuse to act in any other one.
  E.checkLayout = () => {
    const v = E.video();
    if (innerWidth !== 1280 || innerHeight !== 720 || Math.abs(v.videoWidth / v.videoHeight - 16 / 9) > 0.01)
      E.block(`layout_${innerWidth}x${innerHeight}_video_${v.videoWidth}x${v.videoHeight}`);
  };

  // Resolve after a video frame newer than `after` (a video currentTime) is presented.
  const nextFrame = (v, after) => new Promise(resolve => {
    if (!v.requestVideoFrameCallback) { resolve(); return; }
    const timer = setTimeout(resolve, 500);
    const wait = (_, meta) => meta.mediaTime > after ? (clearTimeout(timer), resolve()) : v.requestVideoFrameCallback(wait);
    v.requestVideoFrameCallback(wait);
  });

  let lastTime = -1;
  // A frame: { canvas, width, height, time, data (lazy ImageData) }.
  E.grab = async () => {
    E.check();
    const v = E.video();
    await nextFrame(v, lastTime);
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(v, 0, 0);
    lastTime = v.currentTime;
    let data = null;
    return { canvas, width: canvas.width, height: canvas.height, time: v.currentTime,
      get data() { return data ??= context.getImageData(0, 0, canvas.width, canvas.height).data; } };
  };

  const rect = (frame, [x, y, w, h]) => [Math.round(x * frame.width), Math.round(y * frame.height),
    Math.max(1, Math.round(w * frame.width)), Math.max(1, Math.round(h * frame.height))];
  E.crop = (frame, roi, scale = 1) => {
    const [x, y, w, h] = rect(frame, roi);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high';
    context.drawImage(frame.canvas, x, y, w, h, 0, 0, canvas.width, canvas.height);
    return canvas;
  };
  E.png = canvas => canvas.toDataURL('image/png');

  // Mean RGB of a region.
  E.color = (frame, roi) => {
    const [x0, y0, w, h] = rect(frame, roi);
    const step = Math.max(1, Math.floor(Math.sqrt(w * h / 4000)));
    const d = frame.data; let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y0 + h; y += step) for (let x = x0; x < x0 + w; x += step) {
      const i = (y * frame.width + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    return [r / n, g / n, b / n].map(Math.round);
  };
  E.colorNear = (actual, expected, tolerance = 40) =>
    actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance);

  // Mean absolute difference (0..255) between two frames in a region.
  E.diff = (a, b, roi = [0, 0, 1, 1]) => {
    const [x0, y0, w, h] = rect(a, roi);
    const step = Math.max(1, Math.floor(Math.sqrt(w * h / 20000)));
    const da = a.data, db = b.data; let sum = 0, n = 0;
    for (let y = y0; y < y0 + h; y += step) for (let x = x0; x < x0 + w; x += step) {
      const i = (y * a.width + x) * 4;
      sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); n += 3;
    }
    return sum / n;
  };

  // Wait until a region stops changing: `quiet` consecutive frames under `threshold`.
  E.settle = async ({ roi = [0, 0, 1, 1], threshold = 1.5, quiet = 2, interval = 120, timeout = 5000 } = {}) => {
    const start = performance.now();
    let previous = await E.grab(), still = 0;
    while (performance.now() - start < timeout) {
      await E.sleep(interval);
      const frame = await E.grab();
      still = E.diff(previous, frame, roi) < threshold ? still + 1 : 0;
      previous = frame;
      if (still >= quiet) return frame;
    }
    return previous;
  };

  // ---- OCR -----------------------------------------------------------------------
  // Texts come back as { text, confidence, x, y, w, h } in frame coordinates.
  E.ocr = async (frame, roi = [0, 0, 1, 1], { scale = 1, fast = false, digits = false } = {}) => {
    const canvas = E.crop(frame, roi, scale);
    const image = roi[2] * roi[3] > 0.25 ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
    // Vision occasionally fails a request outright ("TextRecognition.CRImageReaderError
    // error 1", run 20261030-103957-ho5k); the same image reads on a retry.
    let texts;
    for (let attempt = 0; ; attempt++) {
      try { ({ texts } = await bridge({ op: 'ocr', image, fast, digits })); break; } catch (error) {
        if (attempt >= 2) throw error;
        E.log(`ocr retry ${attempt + 1}: ${error?.message || error}`);
        await E.sleep(300 * (attempt + 1));
      }
    }
    E.check();
    return texts.map(t => ({ ...t, x: roi[0] + t.x * roi[2], y: roi[1] + t.y * roi[3], w: t.w * roi[2], h: t.h * roi[3] }));
  };
  const inside = (t, roi) => !roi || (t.x + t.w / 2 >= roi[0] && t.x + t.w / 2 <= roi[0] + roi[2] &&
    t.y + t.h / 2 >= roi[1] && t.y + t.h / 2 <= roi[1] + roi[3]);
  const matches = (text, pattern) => typeof pattern === 'function' ? pattern(text) : pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
  E.find = (texts, pattern, roi) => texts.find(t => inside(t, roi) && matches(t.text, pattern)) || null;
  E.findAll = (texts, pattern, roi) => texts.filter(t => inside(t, roi) && matches(t.text, pattern));
  // Full-frame OCR misses pill labels that crops read (macOS 27 run 20261026-210309-2ptr; Max's 2026-10-26 传送 miss).
  const cropTexts = (look, roi, scale) => {
    const cache = look.cropTexts ??= new Map();
    const key = JSON.stringify([roi, scale]);
    if (!cache.has(key)) cache.set(key, E.ocr(look.frame, roi, { scale }));
    return cache.get(key);
  };
  // `assist` (true for a literal pattern, else the label text) asks the model when Vision
  // finds nothing; see "model assist" below.
  E.findText = async (look, pattern, roi, { assist } = {}) => {
    const hit = E.find(look.texts, pattern, roi);
    if (hit || !roi) return hit;
    for (const scale of [2, 3]) {
      const found = E.find(await cropTexts(look, roi, scale), pattern, roi);
      if (found) return found;
    }
    if (!assist) return null;
    const label = assist === true ? (typeof pattern === 'string' ? pattern : pattern.source.replace(/^\^|\$$/g, '')) : assist;
    const found = await assisted(async () => await E.llm.pick(look, label, roi) ?? await E.llm.locate(look, label, roi));
    if (found) await E.assist?.({ what: `found 「${label}」`, roi, at: E.center(found), via: found.via }, found.shown);
    return found;
  };
  E.findAllText = async (look, pattern, roi) => {
    const hits = E.findAll(look.texts, pattern, roi);
    if (hits.length || !roi) return hits;
    for (const scale of [2, 3]) {
      const found = E.findAll(await cropTexts(look, roi, scale), pattern, roi);
      if (found.length) return found;
    }
    return [];
  };
  E.center = t => [t.x + t.w / 2, t.y + t.h / 2];
  // Item names read in two places name the same item when they differ by at most one
  // glyph (substituted, dropped or added): macOS 27 OCR read 棱 as 楼, 谷 as 合 and
  // dropped the 嵌 of 嵌晶玉 (runs 20261029-203335-p99c, 20261030-113544-tcv6). Callers
  // check price or discount again, so a misread cannot buy the wrong item.
  E.sameName = (a, b) => {
    if (a === b) return true;
    if (!a || !b) return false;
    const x = [...a], y = [...b];
    if (Math.min(x.length, y.length) < 2 || Math.abs(x.length - y.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (x.length > y.length) i++; else if (y.length > x.length) j++; else { i++; j++; }
    }
    return edits + (x.length - i) + (y.length - j) <= 1;
  };
  // Integers in a region, read with OCR (thousands separators and spaces dropped).
  E.readNumbers = async (frame, roi, options) => {
    const texts = await E.ocr(frame, roi, { scale: 2, ...options });
    return texts.flatMap(t => (t.text.replace(/[,，\s]/g, '').match(/\d+/g) || []).map(Number));
  };
  // One integer in a small region, such as an item count on a reward tile. Read with
  // the native `digits` mode (engine.m) at several scales and widths. A value counts
  // when it is the only one read at least twice, or when it has at least 3 votes and
  // twice the runner-up (a widened crop once read "220" as "1220"); otherwise null, or
  // with `assist` the model's reading, if it is one Vision voted for or Vision read none.
  E.readNumber = async (frame, [x, y, w, h], { assist = false } = {}) => {
    const votes = new Map();
    for (const scale of [3, 4, 6]) for (const k of [1, 1.5]) {
      const numbers = await E.readNumbers(frame, [x - w * (k - 1) / 2, y, w * k, h], { scale, digits: true });
      if (numbers.length === 1) votes.set(numbers[0], (votes.get(numbers[0]) || 0) + 1);
    }
    const [[value, count] = [], runnerUp] = [...votes].sort((a, b) => b[1] - a[1]);
    if (count >= 3 && count >= 2 * (runnerUp?.[1] ?? 0) || (count >= 2 && !runnerUp)) return value;
    if (!assist) return null;
    const roi = [x - w / 4, y, w * 1.5, h];
    const read = await assisted(() => E.llm.number(frame, roi));
    if (read === null || (votes.size && !votes.has(read))) return null;
    await E.assist?.({ what: `read ${read}`, roi, vision: Object.fromEntries(votes) }, { canvas: E.crop(frame, roi, 3), time: frame.time });
    return read;
  };

  // ---- model assist --------------------------------------------------------------
  // When Vision misses a label or cannot settle a number, a vision model (DeepSeek, on
  // the user's own key; without one nothing changes) answers about the frame. It only
  // reads and finds, never chooses an action, and callers opt in ({ assist }) where a
  // miss would fail the task; reads that choose a purchase (list prices) or that a
  // purchase, trade or gift is checked against (receipt counts) stay on Vision. The
  // runner records each answer with the image the model saw (E.assist).
  // Offline on our frames (2026-10-30): crops read 48 of 50; given Vision's boxes
  // numbered on the frame it picked 10 of 10; its own coordinates (0-1000) landed on
  // 9 of 10 labels.
  const assisted = async step => {
    try { return await step(); } catch (error) {
      if (error instanceof EngineError) throw error;
      if (error?.message !== 'no_key') E.log(`llm_failed ${error?.message || error}`);
      // A 接管 or 结束 during a failed call must still pause or stop.
      E.check();
      return null;
    }
  };
  const ask = async (canvas, question) => {
    const answer = (await bridge({ op: 'llm', image: canvas.toDataURL('image/jpeg', 0.9), question })).trim();
    E.check();
    return answer;
  };
  E.llm = {
    async number(frame, roi) {
      const answer = await ask(E.crop(frame, roi, 3), '这块游戏截图里有一个数字，是多少？只回答阿拉伯数字；看不清就回答“无”。');
      return /^\d+$/.test(answer) ? Number(answer) : null;
    },
    // Vision's texts in the region, outlined and numbered on the frame; the model names one.
    async pick(look, label, roi) {
      const boxes = [...look.texts, ...await cropTexts(look, roi, 2)].filter(t => inside(t, roi));
      if (!boxes.length) return null;
      const canvas = E.crop(look.frame, [0, 0, 1, 1]), g = canvas.getContext('2d');
      g.lineWidth = 2; g.font = 'bold 20px sans-serif'; g.textBaseline = 'bottom';
      boxes.forEach((b, i) => {
        const [bx, by] = [b.x * canvas.width, b.y * canvas.height], tag = String(i + 1);
        g.strokeStyle = 'red'; g.strokeRect(bx, by, b.w * canvas.width, b.h * canvas.height);
        g.fillStyle = 'red'; g.fillRect(bx, by - 22, g.measureText(tag).width + 6, 22);
        g.fillStyle = 'white'; g.fillText(tag, bx + 3, by);
      });
      const answer = await ask(canvas, `这是一张游戏截图，每个文字区域都用红框框出，每个框左上方紧贴着红底白字的编号。写着「${label}」的是几号框？只回答编号；没有就回答 0。`);
      const box = boxes[Number(answer.match(/\d+/)?.[0]) - 1];
      return box ? { ...box, text: label, via: `pick ${answer}`, shown: { canvas, time: look.frame.time } } : null;
    },
    // The model's own coordinates, 0..1000 (or its <|box|> reply), kept only inside the region.
    async locate(look, label, roi) {
      const canvas = E.crop(look.frame, [0, 0, 1, 1]);
      const answer = await ask(canvas, `这是一张 16:9 的游戏截图。文字「${label}」的中心在哪里？用 0 到 1000 的整数坐标回答（左上角 0,0，右下角 1000,1000），格式 x,y；看不到就回答“无”。`);
      const n = (answer.match(/\d+/g) || []).map(v => Number(v) / 1000);
      if (n.length < 2) return null;
      const [x, y] = n.length >= 4 ? [(n[0] + n[2]) / 2, (n[1] + n[3]) / 2] : n;
      const point = { text: label, confidence: 0, x: x - 0.005, y: y - 0.005, w: 0.01, h: 0.01 };
      return inside(point, roi) ? { ...point, via: `locate ${answer}`, shown: { canvas, time: look.frame.time } } : null;
    },
  };

  // ---- templates -----------------------------------------------------------------
  // Templates are PNGs captured from our own 1920x1080 stream (templates/*.png),
  // embedded at build time as data URLs in window.__engineTemplates.
  const templateCache = new Map();
  const loadTemplate = async name => {
    if (templateCache.has(name)) return templateCache.get(name);
    const url = (window.__engineTemplates || {})[name];
    if (!url) E.fail(`template_missing_${name}`);
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const gray = toGray(context.getImageData(0, 0, image.width, image.height).data);
    const template = { width: image.width, height: image.height, gray };
    templateCache.set(name, template);
    return template;
  };
  const toGray = d => { const g = new Float32Array(d.length / 4); for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return g; };
  // Normalized cross-correlation of a template within a search region. The fixed
  // layout keeps search regions small, so a direct search is fast enough.
  E.match = async (frame, name, roi, { step = 1 } = {}) => {
    const t = await loadTemplate(name);
    const [x0, y0, w, h] = rect(frame, roi);
    if (w < t.width || h < t.height) E.fail(`template_region_too_small_${name}`);
    const region = toGray(frame.canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data);
    const n = t.width * t.height;
    let tMean = 0; for (let i = 0; i < n; i++) tMean += t.gray[i]; tMean /= n;
    let tVar = 0; const tz = new Float32Array(n);
    for (let i = 0; i < n; i++) { tz[i] = t.gray[i] - tMean; tVar += tz[i] * tz[i]; }
    let best = { score: -1, x: 0, y: 0 };
    for (let oy = 0; oy + t.height <= h; oy += step) for (let ox = 0; ox + t.width <= w; ox += step) {
      let sum = 0, sum2 = 0, cross = 0;
      for (let ty = 0; ty < t.height; ty++) {
        const row = (oy + ty) * w + ox, trow = ty * t.width;
        for (let tx = 0; tx < t.width; tx++) { const p = region[row + tx]; sum += p; sum2 += p * p; cross += p * tz[trow + tx]; }
      }
      const variance = sum2 - sum * sum / n;
      const score = variance > 1e-6 && tVar > 1e-6 ? cross / Math.sqrt(variance * tVar) : 0;
      if (score > best.score) best = { score, x: ox, y: oy };
    }
    return { score: best.score, x: (x0 + best.x) / frame.width, y: (y0 + best.y) / frame.height,
      w: t.width / frame.width, h: t.height / frame.height };
  };

  // ---- screens -------------------------------------------------------------------
  // A screen is { name, priority, test(look) -> boolean }. `look` holds one frame and
  // its full-frame OCR. Screens with higher priority win; nothing matching is "unknown".
  E.screen = (name, test, priority = 0) => {
    E.screens = E.screens.filter(s => s.name !== name);
    E.screens.push({ name, test, priority });
    E.screens.sort((a, b) => b.priority - a.priority);
  };
  E.look = async () => {
    const frame = await E.grab();
    const texts = await E.ocr(frame);
    const look = { frame, texts, has: (pattern, roi) => !!E.find(texts, pattern, roi) };
    look.screen = 'unknown';
    for (const s of E.screens) { if (await s.test(look)) { look.screen = s.name; break; } }
    return look;
  };
  // Wait until one of `names` is seen in `stable` consecutive fresh looks.
  E.waitFor = async (names, { timeout = 15000, stable = 2, interval = 250, onLook } = {}) => {
    names = [].concat(names);
    const start = performance.now();
    let last = null, streak = 0;
    while (performance.now() - start < timeout) {
      const look = await E.look();
      if (onLook) await onLook(look);
      streak = last && last.screen === look.screen ? streak + 1 : 1;
      last = look;
      if (names.includes(look.screen) && streak >= stable) return look;
      await E.sleep(interval);
    }
    throw new EngineError('timeout', `expected_${names.join('|')}_saw_${last?.screen}`, { look: last });
  };

  // ---- input ---------------------------------------------------------------------
  const KEYS = { Escape: 27, Enter: 13, Tab: 9, Space: 32, AltLeft: 18, ShiftLeft: 16, ControlLeft: 17,
    F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123 };
  for (let c = 65; c <= 90; c++) KEYS['Key' + String.fromCharCode(c)] = c;
  for (let d = 0; d <= 9; d++) KEYS['Digit' + d] = 48 + d;
  const keyName = code => ({ Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Space: ' ', AltLeft: 'Alt', ShiftLeft: 'Shift',
    ControlLeft: 'Control' })[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code);
  const prepare = () => {
    E.check();
    const v = E.video();
    // Leave the pointer lock alone: with the window focused the game takes it on
    // returning to the world, and releasing it reaches the game as Escape, which
    // opened the menu before every turn (2026-10-23). Synthetic moves work locked.
    // The SDK gates input on its own mouse-enter state. Never call focus(): the SDK's
    // focus handler reads the clipboard.
    v.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    return v;
  };
  const keyEvent = (v, type, code, modifiers = {}) => v.dispatchEvent(new KeyboardEvent(type, {
    key: keyName(code), code, keyCode: KEYS[code], which: KEYS[code], bubbles: true, cancelable: true, ...modifiers }));
  E.key = async (code, { hold = 80 } = {}) => {
    if (!KEYS[code]) E.fail(`unknown_key_${code}`);
    const v = prepare();
    keyEvent(v, 'keydown', code);
    try { await E.sleep(hold); } finally { keyEvent(v, 'keyup', code); }
  };

  // The game cursor follows absolute positions, but only on moves with a non-zero
  // movementX/Y; zero-delta moves are dropped. Track our cursor to send real deltas.
  let cursor = [0.5, 0.5];
  const point = (v, [x, y]) => { const r = v.getBoundingClientRect(); return { clientX: r.left + r.width * x, clientY: r.top + r.height * y, w: r.width, h: r.height }; };
  const mouse = (v, type, at, buttons, delta = [0, 0], modifiers = {}) => {
    const p = point(v, at);
    v.dispatchEvent(new MouseEvent(type, { clientX: p.clientX, clientY: p.clientY, movementX: delta[0], movementY: delta[1],
      button: 0, buttons, bubbles: true, cancelable: true, ...modifiers }));
  };
  const valid = ([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
  // Move the game cursor along a path so every event carries a real delta.
  const travel = async (v, to, { buttons = 0, ms = 160, modifiers } = {}) => {
    const from = cursor, r = point(v, [1, 1]);
    const distance = Math.hypot((to[0] - from[0]) * r.w, (to[1] - from[1]) * r.h);
    const steps = Math.max(2, Math.min(24, Math.round(distance / 25)));
    let previous = [from[0] * r.w, from[1] * r.h];
    for (let i = 1; i <= steps; i++) {
      const at = [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps];
      const now = [at[0] * r.w, at[1] * r.h];
      let delta = [Math.round(now[0] - previous[0]), Math.round(now[1] - previous[1])];
      if (!delta[0] && !delta[1]) delta = [i % 2 ? 1 : -1, 0];
      mouse(v, 'mousemove', at, buttons, delta, modifiers);
      previous = now;
      await E.sleep(ms / steps);
    }
    cursor = to;
  };
  E.move = async (x, y, options) => { if (!valid([x, y])) E.fail('invalid_position'); await travel(prepare(), [x, y], options); };
  // Turn the world camera by relative mouse motion (dx, dy in screen widths/heights)
  // without moving the cursor: moves at a fixed point that carry only movementX/Y.
  // At the app's default mouse sensitivity (8) a full turn is about 5.3 widths;
  // positive dy looks down.
  E.turn = async (dx, dy = 0, { ms = 300 } = {}) => {
    const v = prepare(), r = v.getBoundingClientRect();
    const total = [dx * r.width, dy * r.height];
    const steps = Math.max(2, Math.min(24, Math.round(Math.hypot(...total) / 25)));
    for (let i = 0; i < steps; i++) {
      mouse(v, 'mousemove', cursor, 0, [Math.round(total[0] / steps), Math.round(total[1] / steps)]);
      await E.sleep(ms / steps);
    }
  };
  E.wheel = async deltaY => {
    const v = prepare(), p = point(v, cursor);
    v.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0, clientX: p.clientX, clientY: p.clientY, bubbles: true, cancelable: true }));
  };
  // Park the cursor where it does not cover or tilt the UI (the main menu has a
  // cursor parallax), then let the screen settle.
  E.park = async ({ at = [0.5, 0.5], settle = 400 } = {}) => { await E.move(...at); await E.sleep(settle); };
  E.click = async (x, y, { hold = 80, alt = false } = {}) => {
    if (!valid([x, y])) E.fail('invalid_position');
    const v = prepare();
    if (alt) { keyEvent(v, 'keydown', 'AltLeft', { altKey: true }); await E.sleep(200); }
    try {
      await travel(v, [x, y], { modifiers: alt ? { altKey: true } : undefined });
      await E.sleep(40);
      mouse(v, 'mousedown', [x, y], 1, [0, 0], alt ? { altKey: true } : undefined);
      try { await E.sleep(hold); } finally { mouse(v, 'mouseup', [x, y], 0, [0, 0], alt ? { altKey: true } : undefined); }
    } finally {
      if (alt) { await new Promise(r => setTimeout(r, 80)); keyEvent(v, 'keyup', 'AltLeft'); }
    }
  };
  // In-world HUD buttons only take clicks while Alt shows the cursor.
  E.altClick = (x, y, options) => E.click(x, y, { ...options, alt: true });
  // Press, move with real deltas, release. Never use on item grids: dragging an item
  // there moves it between containers.
  E.drag = async (from, to, { ms = 500 } = {}) => {
    if (!valid(from) || !valid(to)) E.fail('invalid_position');
    const v = prepare();
    await travel(v, from);
    mouse(v, 'mousedown', from, 1);
    try { await E.sleep(60); await travel(v, to, { buttons: 1, ms }); await E.sleep(60); }
    finally { mouse(v, 'mouseup', to, 0); }
  };

  // ---- spending guard ------------------------------------------------------------
  // Max's rule: never spend 衍质源石 or 嵌晶玉. Before confirming anything that
  // spends, a task calls this on a fresh look of the confirmation screen. A bare 源石
  // counts only on its own or with a count: place names such as the outpost
  // location 源石研究园 contain it (blocked a trade 2026-10-22).
  E.PREMIUM = /衍质源石|至纯源石|嵌晶玉|^源石\s*([×xX]?\s*\d+)?$/;
  // `ignore`: regions whose texts may name a premium item that is itself the goods,
  // bought with another currency (嵌晶玉 in the 信用交易所); never the price.
  E.guardSpend = (look, { ignore = [] } = {}) => {
    const hit = look.texts.find(t => E.PREMIUM.test(t.text) && !ignore.some(roi => inside(t, roi)));
    if (hit) E.block(`premium_currency_on_screen:${hit.text}`);
  };
})();
