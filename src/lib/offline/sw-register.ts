/** Service worker registration and update handling. The worker only caches the public field-mode shell and static assets (see public/sw.js). */
export interface SwHandle {
  /** a new version is installed and waiting; the app shows "Update available" and the user chooses when to reload */
  onUpdateReady(cb: () => void): void;
  applyUpdate(): void;
  supported: boolean;
}

export async function registerServiceWorker(): Promise<SwHandle> {
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator && (window.isSecureContext ?? false);
  const listeners: (() => void)[] = [];
  let waiting: ServiceWorker | null = null;
  const handle: SwHandle = {
    supported,
    onUpdateReady: (cb) => { listeners.push(cb); if (waiting) cb(); },
    applyUpdate: () => waiting?.postMessage({ type: "SKIP_WAITING" }),
  };
  if (!supported) return handle;
  const hadController = !!navigator.serviceWorker.controller; // first install also fires controllerchange; do not reload then
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const announce = (w: ServiceWorker | null) => { if (w && navigator.serviceWorker.controller) { waiting = w; listeners.forEach((l) => l()); } };
    if (reg.waiting) announce(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed") announce(w); });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload(); // only after the user asked for the update; local records are in IndexedDB and are untouched
    });
    // Make sure everything this page needed is available offline, including files loaded before the worker took control.
    const ready = await navigator.serviceWorker.ready;
    const urls = [...new Set([
      "/field",
      ...performance.getEntriesByType("resource").map((e) => new URL(e.name, location.href)).filter((u) => u.origin === location.origin && u.pathname.startsWith("/_next/static/")).map((u) => u.pathname + u.search),
    ])];
    ready.active?.postMessage({ type: "CACHE_URLS", urls });
  } catch {
    /* registration can fail in private mode or unsupported browsers: the app keeps working online */
  }
  return handle;
}
