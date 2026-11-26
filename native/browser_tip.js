// The cloud page tells WebKit users to switch to Chrome ("当前浏览器可能影响游戏体验").
// This app is the browser, so hide that notice. Its class names are build hashes; the
// close button's aria-label is the stable handle.
(() => {
  if (window.top !== window || location.origin !== "https://endfield.hypergryph.com") return;
  const style = new CSSStyleSheet();
  style.replaceSync('aside:has(> [aria-label="关闭浏览器兼容性提示"]) { display: none !important; }');
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
})();
