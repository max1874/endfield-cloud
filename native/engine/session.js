// Cloud session lifecycle on the official web page: start a session (retrying the
// server's cooldown and queue timeouts) and exit it. These are DOM controls of the
// page, not the game stream, so they are clicked as elements. Starting works only if
// the page believes it is visible (native/visibility.js).
(() => {
  const E = window.__engine;
  if (!E || E.session) return;

  // Only act on laid-out elements. Opacity is no signal: while the screen is locked
  // WebKit suspends the page's fade-in animations, leaving live controls at opacity 0.
  const shown = element => {
    if (!element || !element.getBoundingClientRect().width) return false;
    for (let p = element; p; p = p.parentElement) {
      const style = getComputedStyle(p);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  // A shown button with this exact text; with `context`, only one whose dialog (an
  // ancestor) also shows that text, since the page keeps other dialogs mounted.
  const button = (text, context) => [...document.querySelectorAll('button')].find(b => {
    if (b.innerText.trim() !== text || !shown(b)) return false;
    if (!context) return true;
    for (let p = b.parentElement; p && p !== document.body; p = p.parentElement)
      if (context.test(p.innerText)) return true;
    return false;
  }) || null;
  const labeled = pattern => [...document.querySelectorAll('button')].find(b => pattern.test(b.getAttribute('aria-label') || '') && shown(b)) || null;
  const shownText = pattern => [...document.querySelectorAll('body *')]
    .some(e => e.childElementCount === 0 && pattern.test(e.textContent) && shown(e));
  const video = () => document.getElementById('WelinkGameVideo');
  const streaming = () => {
    const v = video();
    return v instanceof HTMLVideoElement && v.readyState >= 2 && v.videoWidth > 0;
  };
  const startButtons = () => [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === '开始游戏' && shown(b));
  // Server-side conditions that clear by themselves (AGENTS.md, "Runtime").
  const RETRYABLE = /火速处理中|排队超时/;

  E.session = {
    streaming,
    // While a session connects, the video element exists but plays nothing and the
    // home page's 开始游戏 stays laid out underneath; pressing it then ends the new
    // session and triggers the server cooldown (observed 2026-10-22 09:08).
    state() {
      if (streaming()) return 'streaming';
      if (shownText(RETRYABLE)) return 'retry_later';
      if (video()) return 'connecting';
      if (startButtons().length) return 'home';
      return 'other';
    },
    // Start a session and wait until the stream is playing. The home page may need
    // two presses: the first can reveal the account panel with its own 开始游戏, which
    // comes after the hero's in the DOM. After a press, wait for the page to react
    // before pressing again; the button throttles and a repeat can restart the session.
    async start({ timeout = 8 * 60000 } = {}) {
      const begin = performance.now();
      let presses = 0;
      while (performance.now() - begin < timeout) {
        const state = this.state();
        if (state === 'streaming') { E.log(`session streaming presses=${presses}`); return true; }
        if (state === 'retry_later') {
          E.log('session server busy; retrying in 20 s');
          button('知道了')?.click();
          await E.sleep(20000);
        } else if (state === 'home') {
          const buttons = startButtons();
          presses++;
          E.log(`session press 开始游戏 ${presses} of ${buttons.length}`);
          buttons[buttons.length - 1].click();
          const pressed = performance.now();
          while (performance.now() - pressed < 20000 && this.state() === 'home' && startButtons().length === buttons.length)
            await E.sleep(500);
        } else {
          await E.sleep(1000);
        }
      }
      E.fail('session_start_timeout');
    },
    // Leave the cloud session so it stops using play time: open the edge-docked game
    // menu (it slides in on hover; the page's handlers listen to pointerover/mouseover,
    // so a bare mouseenter does nothing), press 退出游戏, confirm.
    async exit() {
      if (!streaming()) return false;
      const menu = labeled(/^游戏菜单$/);
      if (!menu) E.fail('session_menu_missing');
      const host = menu.parentElement, r = menu.getBoundingClientRect();
      const at = { clientX: r.x + r.width - 5, clientY: r.y + r.height / 2, bubbles: true };
      host.dispatchEvent(new PointerEvent('pointerover', at));
      host.dispatchEvent(new PointerEvent('pointerenter', { ...at, bubbles: false }));
      host.dispatchEvent(new MouseEvent('mouseover', at));
      host.dispatchEvent(new MouseEvent('mouseenter', { ...at, bubbles: false }));
      await E.sleep(800);
      menu.click();
      let exit = null;
      for (let i = 0; i < 10 && !(exit = labeled(/^退出游戏$/)); i++) await E.sleep(300);
      if (!exit) E.fail('session_exit_missing');
      exit.click();
      await E.sleep(1500);
      const confirm = button('确认退出', /重新排队/);
      if (!confirm) E.fail('session_exit_confirm_missing');
      confirm.click();
      for (let i = 0; i < 20 && streaming(); i++) await E.sleep(500);
      if (streaming()) E.fail('session_exit_failed');
      E.log('session exited');
      return true;
    }
  };
})();
