"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { useI18n } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/errors";
import { ApiError } from "./api";

/**
 * Runs an async API action with consistent pending state, success/error toasts and a server refresh.
 * Returns the result (or undefined on failure) so forms can react to field-level errors.
 * The exposed `error` has its message translated into the interface language when the error code is known.
 */
export function useAction() {
  const toast = useToast();
  const router = useRouter();
  const i18n = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function run<T>(fn: () => Promise<T>, opts: { success?: string; refresh?: boolean; silentError?: boolean } = {}): Promise<T | undefined> {
    setPending(true);
    setError(null);
    try {
      const v = await fn();
      if (opts.success) toast.success(opts.success);
      if (opts.refresh !== false) router.refresh();
      return v;
    } catch (e) {
      const raw = e instanceof ApiError ? e : new ApiError(0, "unknown", "Something went wrong. Please try again.");
      const err = new ApiError(raw.status, raw.code, raw.code === "unknown" ? i18n.t("errors.generic") : errorText(raw, i18n), raw.fields);
      setError(err);
      if (!opts.silentError) toast.error(err.message);
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error };
}
