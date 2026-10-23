// Task registry and runner. Each task run writes, under
// automation/<run>/<task>/: numbered evidence frames, and result.json with the
// verdict, the recognized changes and the frames that prove them (AGENTS.md,
// "Essential variable"). A run writes summary.json linking every task.
(() => {
  const E = window.__engine;
  if (!E || E.run) return;
  const bridge = message => window.webkit.messageHandlers.endfieldEngine.postMessage(message);

  // Define a task. `run(t)` must record before/after evidence through `t` and return
  // via t.pass(...) / t.skip(...); throwing ends it as failed/blocked/timeout/stopped.
  E.task = (id, { title, run, start = 'world' }) => E.tasks.set(id, { id, title, run, start });

  // Local time, e.g. 20261022-0412.
  const stamp = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };

  class TaskContext {
    constructor(runId, task, options) {
      this.task = task; this.options = options || {};
      this.dir = `${runId}/${task.id}`;
      this.frames = []; this.changes = []; this.notes = []; this.index = 0;
      this.verdict = null; this.summary = '';
    }
    // Save a frame as evidence; returns its file name.
    async save(frame, label) {
      const name = `${String(this.index++).padStart(3, '0')}-${label.replace(/[^A-Za-z0-9_-]/g, '_')}.png`;
      await bridge({ op: 'save', path: `${this.dir}/${name}`, image: E.png(frame.canvas) });
      this.frames.push({ name, label, videoTime: frame.time });
      return name;
    }
    // Record a recognized in-game change, e.g. { what: '调度券', before: 120, after: 80 },
    // with the frames it was read from.
    change(record) { this.changes.push(record); E.log(`task=${this.task.id} change`, record); }
    note(text) { this.notes.push(text); E.log(`task=${this.task.id} note ${text}`); }
    pass(summary) { this.verdict = 'passed'; this.summary = summary; return this; }
    // Nothing to do (e.g. no products ready); still requires evidence of the checked state.
    skip(summary) { this.verdict = 'nothing_to_do'; this.summary = summary; return this; }
    async write(extra = {}) {
      const result = { task: this.task.id, title: this.task.title, verdict: this.verdict, summary: this.summary,
        changes: this.changes, notes: this.notes, frames: this.frames, options: this.options, ...extra };
      await bridge({ op: 'save', path: `${this.dir}/result.json`, text: JSON.stringify(result, null, 2) });
      return result;
    }
  }

  // The run's controls: a small bar at the top center of the page, outside the game
  // video, so its clicks do not reach the game. While a task runs it offers 接管
  // (pause and hand the game to the user);
  // while paused, 继续 (start the interrupted task over) and 结束. The 自动化 menu
  // has the same actions for when the game holds the pointer and the bar cannot be
  // clicked. Evidence frames come from the video, so the bar never shows in them.
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'display:none;align-items:center;gap:8px;padding:4px 6px 4px 12px;border-radius:16px;' +
    'background:rgba(20,20,20,.86);color:#fff;font:13px -apple-system,sans-serif;white-space:nowrap';
  const label = document.createElement('span');
  const button = (text, primary, action) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = `border:0;border-radius:12px;padding:3px 12px;font:inherit;cursor:pointer;` +
      (primary ? 'background:#ffe14d;color:#111' : 'background:#555;color:#fff');
    b.addEventListener('click', action);
    return b;
  };
  const takeOver = button('接管', false, () => E.pause('take_over'));
  const resume = button('继续', true, () => E.resume());
  const end = button('结束', false, () => E.stop('ended_by_user'));
  bar.append(label, takeOver, resume, end);
  for (const type of ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'])
    bar.addEventListener(type, event => event.stopPropagation());
  E.controls = bar;
  // mode: 'running' (接管), 'paused' (继续, 结束) or 'done' (no buttons, fades after 15 s).
  let fade = null;
  const show = (text, mode) => {
    if (!bar.isConnected) document.body.append(bar);
    clearTimeout(fade);
    label.textContent = text;
    takeOver.style.display = mode === 'running' ? '' : 'none';
    resume.style.display = end.style.display = mode === 'paused' ? '' : 'none';
    bar.style.padding = mode === 'done' ? '6px 12px' : '4px 6px 4px 12px';
    bar.style.display = 'flex';
    if (mode === 'done') fade = setTimeout(() => { bar.style.display = 'none'; }, 15000);
    E.status(text);
  };

  // Run `step`; when a pause interrupts it, hold until 继续 and run it again from the
  // start, or rethrow on 结束. `onPause` records the interruption.
  async function guarded(step, title, onPause) {
    for (;;) {
      try { return await step(); } catch (error) {
        if (!E.isPause(error)) throw error;
        const reason = error.message.slice('pause:'.length);
        E.log(`run paused ${reason} at ${title}`);
        onPause?.(reason);
        show(`已暂停：${title}`, 'paused');
        if (!await E.hold()) throw new E.EngineError('stopped', 'ended_by_user');
        E.log(`run continued at ${title}`);
        show(`${title} · 运行中`, 'running');
      }
    }
  }

  let current = null;
  // Run tasks in order. Each task starts from its start screen and the game is
  // returned to the world afterwards, whatever the outcome. With `session`, the run
  // also starts the cloud session first and exits it at the end (unattended runs);
  // with 'auto', it starts one only when none is playing and exits only the one it
  // started.
  E.run = async (ids, { options = {}, session = false } = {}) => {
    if (current) { E.log('run rejected: already running'); return null; }
    const runId = `${stamp()}-${Math.random().toString(36).slice(2, 6)}`;
    const results = [];
    current = runId;
    E.begin();
    E.log(`run start id=${runId} tasks=${ids.join(',')} session=${session}`);
    const own = session === true || (session === 'auto' && !E.session.streaming());
    // Ended by the user (结束, menu 停止): they have the game, so the session stays.
    let ended = false;
    try {
      if (own) {
        show('正在启动云游戏', 'running');
        await guarded(() => E.session.start(), '启动云游戏');
      }
      for (const [index, id] of ids.entries()) {
        const task = E.tasks.get(id);
        if (!task) { results.push({ task: id, verdict: 'failed', summary: 'unknown_task' }); continue; }
        const t = new TaskContext(runId, task, options[id]);
        const title = ids.length > 1 ? `${task.title}（${index + 1}/${ids.length}）` : task.title;
        show(`${title} · 运行中`, 'running');
        const started = Date.now();
        try {
          // After a pause the task starts over from its start screen; changes it made
          // before stay recorded.
          await guarded(async () => {
            E.checkLayout();
            await E.nav.to(task.start, t);
            await task.run(t);
          }, title, reason => t.note(`paused (${reason}), started over on 继续`));
          if (!t.verdict) E.fail('task_returned_without_verdict');
          if (t.verdict === 'passed' && t.changes.length === 0) E.fail('passed_without_recognized_change');
        } catch (error) {
          t.verdict = error instanceof E.EngineError ? error.kind : 'failed';
          t.summary = error.message || String(error);
          const look = error?.detail?.look;
          try { await t.save(look?.frame || await E.grab(), `end-${t.verdict}`); } catch {}
          if (look) t.note(`last_screen=${look.screen} texts=${look.texts.slice(0, 12).map(x => x.text).join('|')}`);
        }
        const result = await t.write({ seconds: Math.round((Date.now() - started) / 1000) });
        results.push(result);
        E.log(`task=${id} verdict=${t.verdict} ${t.summary}`);
        if (t.verdict === 'stopped') { ended = true; break; }
        try { await guarded(() => E.nav.to('world', null), title); } catch (error) {
          E.log(`recover_failed ${error.message}`);
          if (error.kind === 'stopped') ended = true;
          break;
        }
      }
      if (own && !ended) {
        show('正在退出云游戏', 'running');
        await guarded(() => E.session.exit(), '退出云游戏');
      }
    } catch (error) {
      E.log(`run aborted ${error.message || error}`);
    } finally {
      E.end();
      current = null;
      const summary = { run: runId, finished: new Date().toISOString(),
        tasks: results.map(r => ({ task: r.task, title: r.title, verdict: r.verdict, summary: r.summary, changes: r.changes })) };
      await bridge({ op: 'save', path: `${runId}/summary.json`, text: JSON.stringify(summary, null, 2) }).catch(() => {});
      const failed = results.filter(r => !['passed', 'nothing_to_do'].includes(r.verdict));
      show(ended ? '已结束，游戏交给你了' : failed.length ? `完成，${failed.length} 项未成功：${failed.map(r => r.title || r.task).join('、')}` : `完成 ${results.length} 项`, 'done');
      E.log(`run end id=${runId} ${results.map(r => `${r.task}=${r.verdict}`).join(' ')}`);
    }
    return results;
  };
})();
