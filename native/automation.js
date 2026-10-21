(() => {
  if (window.top !== window || location.origin !== 'https://endfield.hypergryph.com' ||
      !/^\/cloud(?:\/|$)/.test(location.pathname)) return;

  let stopped = false;
  let release = null;
  const video = () => {
    const element = document.getElementById('WelinkGameVideo');
    if (!(element instanceof HTMLVideoElement) || element.readyState < 2 || !element.videoWidth)
      throw new Error('stream_not_ready');
    return element;
  };
  const prepareInput = () => {
    const element = video();
    if (stopped || !document.hasFocus()) throw new Error('input_not_active');
    // The SDK gates keyboard input on its own mouse-enter state.
    // Do not call focus(): the SDK focus handler also reads the clipboard.
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    return element;
  };
  const stop = () => {
    stopped = true;
    if (release) release();
    release = null;
  };
  document.addEventListener('keydown', event => {
    if (event.isTrusted && event.key === 'Escape') stop();
  }, true);
  window.addEventListener('blur', stop);

  window.__endfieldAutomation = {
    begin() { stopped = false; document.exitPointerLock(); return true; },
    stop() { stop(); return true; },
    capture() {
      const element = video();
      const canvas = document.createElement('canvas');
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      canvas.getContext('2d').drawImage(element, 0, 0);
      return { png: canvas.toDataURL('image/png').split(',')[1],
        width: canvas.width, height: canvas.height, time: element.currentTime,
        stopped, focused: document.hasFocus() };
    },
    escape() {
      const element = prepareInput();
      const options = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
        bubbles: true, cancelable: true };
      release = () => element.dispatchEvent(new KeyboardEvent('keyup', options));
      element.dispatchEvent(new KeyboardEvent('keydown', options));
      setTimeout(() => { if (release) release(); release = null; }, 80);
      return true;
    },
    click(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
        throw new Error('invalid_position');
      const element = prepareInput();
      if (document.pointerLockElement) throw new Error('cursor_still_locked');
      const rect = element.getBoundingClientRect();
      const options = { clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y,
        button: 0, bubbles: true, cancelable: true };
      element.dispatchEvent(new MouseEvent('mousemove', options));
      release = () => element.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 }));
      element.dispatchEvent(new MouseEvent('mousedown', { ...options, buttons: 1 }));
      setTimeout(() => { if (release) release(); release = null; }, 80);
      return true;
    }
  };
})();
