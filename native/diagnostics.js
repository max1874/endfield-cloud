(() => {
  if (location.origin !== "https://endfield.hypergryph.com") return;

  const post = message => window.webkit?.messageHandlers?.endfieldDiagnostics?.postMessage(message);
  // Strip query strings, fragments and long opaque values so tokens never reach the log.
  const redact = text => String(text)
    .replace(/([?#])[^\s"')]*/g, "$1<redacted>")
    .replace(/[A-Za-z0-9_\-]{32,}/g, "<redacted>")
    .slice(0, 600);
  const describe = value => {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === "object" && value !== null) {
      try { return JSON.stringify(value); } catch { return Object.prototype.toString.call(value); }
    }
    return String(value);
  };
  const frame = window.top === window ? "main" : "sub";

  for (const level of ["error", "warn"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      post(`${frame} console.${level} ${redact(args.map(describe).join(" "))}`);
      original(...args);
    };
  }
  window.addEventListener("error", event => {
    post(`${frame} uncaught ${redact(event.message)} at ${redact(event.filename)}:${event.lineno}`);
  });
  window.addEventListener("unhandledrejection", event => {
    post(`${frame} unhandled_rejection ${redact(describe(event.reason))}`);
  });
  // Classify an ICE candidate's address without logging it.
  const addressClass = candidateLine => {
    const address = String(candidateLine).split(" ")[4] || "";
    if (address.endsWith(".local")) return "mdns";
    if (address.includes(":")) return "ipv6";
    if (/^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(address)) return "ipv4-private";
    if (/^198\.1[89]\./.test(address)) return "ipv4-tun";
    return /^\d+\.\d+\.\d+\.\d+$/.test(address) ? "ipv4-public" : "unknown";
  };
  // The stream is WebRTC; log connection progress without addresses.
  const NativePeerConnection = window.RTCPeerConnection;
  if (NativePeerConnection) {
    let nextId = 1;
    window.RTCPeerConnection = class extends NativePeerConnection {
      constructor(config, ...rest) {
        super(config, ...rest);
        const id = nextId++;
        const servers = (config?.iceServers || []).flatMap(server => [].concat(server.urls || server.url || []))
          .map(url => String(url).split(":")[0] + (String(url).includes("transport=tcp") ? "/tcp" : ""));
        post(`${frame} rtc#${id} created ice_servers=[${servers.join(",")}] policy=${config?.iceTransportPolicy || "all"}`);
        const log = name => () => post(`${frame} rtc#${id} ${name}=${this[name]}`);
        for (const [event, name] of [["iceconnectionstatechange", "iceConnectionState"],
          ["connectionstatechange", "connectionState"], ["icegatheringstatechange", "iceGatheringState"],
          ["signalingstatechange", "signalingState"]]) this.addEventListener(event, log(name));
        this.addEventListener("icecandidate", event => {
          const c = event.candidate;
          post(`${frame} rtc#${id} local_candidate ${c ? `${c.type}/${c.protocol}/${addressClass(c.candidate)}` : "end"}`);
        });
        this.addEventListener("icecandidateerror", event => {
          post(`${frame} rtc#${id} candidate_error code=${event.errorCode} ${redact(event.errorText)}`);
        });
      }
      addIceCandidate(candidate, ...rest) {
        const text = candidate?.candidate || "";
        const type = / typ (\w+)/.exec(text)?.[1] || "?";
        const protocol = / (udp|tcp) /i.exec(text)?.[1]?.toLowerCase() || "?";
        post(`${frame} rtc remote_candidate ${type}/${protocol}`);
        return super.addIceCandidate(candidate, ...rest);
      }
      setRemoteDescription(description, ...rest) {
        const sdp = description?.sdp || "";
        const types = [...sdp.matchAll(/a=(candidate:[^\r\n]*)/g)]
          .map(m => `${/ typ (\w+)/.exec(m[1])?.[1]}/${m[1].split(" ")[2]?.toLowerCase()}/${addressClass(m[1])}`);
        post(`${frame} rtc remote_description ${description?.type} sdp_candidates=[${types.join(",")}]`);
        return super.setRemoteDescription(description, ...rest);
      }
    };
  }
  // The stream size follows the viewport; log every change so layout drift is visible.
  document.addEventListener("resize", event => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    post(`${frame} video_size=${video.videoWidth}x${video.videoHeight} viewport=${innerWidth}x${innerHeight}@${devicePixelRatio}`);
  }, true);
  // Worker exceptions surface only on the Worker object, never on window.
  const NativeWorker = window.Worker;
  if (NativeWorker) {
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        post(`${frame} worker_created ${redact(args[0])}`);
        this.addEventListener("error", event => {
          post(`${frame} worker_error ${redact(event.message)} at ${redact(event.filename)}:${event.lineno}`);
        });
      }
    };
  }
})();
