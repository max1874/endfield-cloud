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

  let current = null;
  // Run tasks in order. Each task starts from its start screen and the game is
  // returned to the world afterwards, whatever the outcome. With `session`, the run
  // also starts the cloud session first and exits it at the end (unattended runs).
  E.run = async (ids, { options = {}, session = false } = {}) => {
    if (current) { E.log('run rejected: already running'); return null; }
    const runId = `${stamp()}-${Math.random().toString(36).slice(2, 6)}`;
    const results = [];
    current = runId;
    E.begin();
    E.log(`run start id=${runId} tasks=${ids.join(',')} session=${session}`);
    try {
      if (session) {
        E.status('正在启动云游戏');
        await E.session.start();
      }
      for (const id of ids) {
        const task = E.tasks.get(id);
        if (!task) { results.push({ task: id, verdict: 'failed', summary: 'unknown_task' }); continue; }
        const t = new TaskContext(runId, task, options[id]);
        E.status(`${task.title} · 手动操作游戏即停止`);
        const started = Date.now();
        try {
          E.checkLayout();
          await E.nav.to(task.start, t);
          await task.run(t);
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
        if (t.verdict === 'stopped') break;
        try { await E.nav.to('world', null); } catch (error) {
          E.log(`recover_failed ${error.message}`);
          break;
        }
      }
      if (session) await E.session.exit();
    } catch (error) {
      E.log(`run aborted ${error.message || error}`);
    } finally {
      E.end();
      current = null;
      const summary = { run: runId, finished: new Date().toISOString(),
        tasks: results.map(r => ({ task: r.task, title: r.title, verdict: r.verdict, summary: r.summary, changes: r.changes })) };
      await bridge({ op: 'save', path: `${runId}/summary.json`, text: JSON.stringify(summary, null, 2) }).catch(() => {});
      const failed = results.filter(r => !['passed', 'nothing_to_do'].includes(r.verdict));
      E.status(failed.length ? `完成，${failed.length} 项未成功：${failed.map(r => r.title || r.task).join('、')}` : `完成 ${results.length} 项`);
      E.log(`run end id=${runId} ${results.map(r => `${r.task}=${r.verdict}`).join(' ')}`);
    }
    return results;
  };
})();
