import type { AiProvider } from "./provider";
import { demoProvider } from "./demo-provider";
import { createAnthropicProvider } from "./anthropic-provider";
import { AiProviderError } from "./provider";

export type ProviderStatus = {
  mode: "demo" | "anthropic";
  label: string;
  simulated: boolean;
  configured: boolean;
  note: string;
};

export const AI_TIMEOUT_MS = 25_000;

/** Which provider the server is configured to use. `AI_PROVIDER=demo` (default) needs no key. */
export function providerStatus(env: NodeJS.ProcessEnv = process.env): ProviderStatus {
  const mode = env.AI_PROVIDER === "anthropic" ? "anthropic" : "demo";
  if (mode === "demo") {
    return {
      mode,
      label: "Simulated AI (demo provider)",
      simulated: true,
      configured: true,
      note: "Deterministic templates built from the retrieved practice cards. Not a language model.",
    };
  }
  const configured = !!env.ANTHROPIC_API_KEY && !!env.ANTHROPIC_MODEL;
  return {
    mode,
    label: configured ? `Anthropic · ${env.ANTHROPIC_MODEL}` : "Anthropic (not configured)",
    simulated: false,
    configured,
    note: configured
      ? "Real model output. Citations are still verified against retrieved approved cards."
      : "AI_PROVIDER=anthropic is set but ANTHROPIC_API_KEY / ANTHROPIC_MODEL are missing on the server.",
  };
}

export function getProvider(env: NodeJS.ProcessEnv = process.env, override?: "demo"): AiProvider {
  if (override === "demo") return demoProvider;
  const status = providerStatus(env);
  if (status.mode === "demo") return demoProvider;
  if (!status.configured) {
    throw new AiProviderError(
      "not_configured",
      "The real AI provider is selected but not configured on the server. Use the simulated draft instead.",
    );
  }
  return createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY!, model: env.ANTHROPIC_MODEL!, baseUrl: env.ANTHROPIC_BASE_URL });
}
