"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Field mode is ONE server-rendered page; screens switch with the URL hash (#/visit/<id>). Nothing is fetched from the server
 * when moving between screens, so navigation works with no connection, and a refresh returns to the same screen.
 *
 * Only hashes that start with "/" are routes. Any other hash is an in-page anchor (the global "Skip to content" link uses #main):
 * it moves focus to that element and leaves the current screen alone.
 */
let lastRoute = "";

function routeFromHash(): string {
  const raw = window.location.hash.replace(/^#/, "");
  if (raw === "" || raw.startsWith("/")) { lastRoute = raw; return raw || "/"; }
  return lastRoute || "/";
}

const subscribe = (cb: () => void) => {
  const onChange = () => {
    const raw = window.location.hash.replace(/^#/, "");
    if (raw !== "" && !raw.startsWith("/")) {
      // in-page anchor (skip link): focus the target, restore the route hash so the screen does not change
      const el = document.getElementById(raw);
      const restore = lastRoute ? `#${lastRoute}` : window.location.pathname + window.location.search;
      history.replaceState(null, "", restore);
      el?.focus({ preventScroll: false });
      el?.scrollIntoView?.();
      return;
    }
    cb();
  };
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export function useHashRoute() {
  const path = useSyncExternalStore(subscribe, routeFromHash, () => "/");
  const go = useCallback((to: string) => { window.location.hash = to.startsWith("/") ? to : `/${to}`; }, []);
  const segments = path.split("?")[0].split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  return { path, segments, go };
}

export const hrefTo = (to: string) => `#${to.startsWith("/") ? to : `/${to}`}`;
