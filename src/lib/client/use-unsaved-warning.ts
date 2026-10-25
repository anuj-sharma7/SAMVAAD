"use client";

import { useEffect } from "react";

/**
 * Asks the browser to confirm before the page is closed, reloaded or left while a form has changes that are not saved yet.
 * Nothing is written to browser storage: unsaved text stays in memory only (visit notes can be sensitive).
 */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // required by some browsers to show the standard prompt
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
