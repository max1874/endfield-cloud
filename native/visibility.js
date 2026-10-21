// WebKit reports the page as hidden while the screen is locked, even with window
// occlusion detection off (native/background.m), and the cloud page then refuses to
// start a session. The client is meant to keep playing unattended, so the page
// always reads itself as visible. visibilitychange events still pass through: the page
// re-reads the state on them, and the getters answer "visible".
(() => {
  if (location.origin !== 'https://endfield.hypergryph.com') return;
  const visible = { configurable: true, get: () => 'visible' };
  Object.defineProperty(Document.prototype, 'visibilityState', visible);
  Object.defineProperty(Document.prototype, 'webkitVisibilityState', visible);
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => false });
  Object.defineProperty(Document.prototype, 'webkitHidden', { configurable: true, get: () => false });
})();
