(() => {
  if (window.top !== window || location.origin !== "https://endfield.hypergryph.com" ||
      !/^\/cloud(?:\/|$)/.test(location.pathname)) return;

  const report = event => window.webkit?.messageHandlers?.endfieldPointerLockEvents?.postMessage(event);
  let moved = false;
  let sensitivity = 8;

  const applySensitivity = () => {
    // In the current SDK this method is a stateless setter for its shared input
    // multiplier. The site's startGame path does not initialize WelinkPlugins.
    const sdkPrototype = window.WelinkCloudGame?.prototype;
    if (typeof sdkPrototype?.setMouseSensitivity !== "function") {
      report("sensitivity_unavailable");
      return;
    }
    try {
      report(sdkPrototype.setMouseSensitivity(sensitivity) ? `sensitivity_${sensitivity}` : "sensitivity_unavailable");
    } catch {
      report("sensitivity_unavailable");
    }
  };
  window.__endfieldSetMouseSensitivity = value => {
    if (![1, 2, 4, 8, 16].includes(value)) return;
    sensitivity = value;
    applySensitivity();
  };

  document.addEventListener("DOMContentLoaded", () => report("bridge_ready"), { once: true });
  document.addEventListener("pointerlockchange", () => {
    moved = false;
    if (document.pointerLockElement) applySensitivity();
    report(document.pointerLockElement ? "locked" : "released");
  });
  document.addEventListener("pointerlockerror", () => report("error"));
  document.addEventListener("mousemove", event => {
    if (document.pointerLockElement && !moved && (event.movementX || event.movementY)) {
      moved = true;
      report("relative_motion");
    }
  });
})();
