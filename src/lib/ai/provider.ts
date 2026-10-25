import type { AiTask } from "./schemas";

export type AiErrorCode =
  | "not_configured"
  | "invalid_credentials"
  | "insufficient_credits"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "malformed_output";

/** A controlled provider failure. `message` is safe to show the mentor; it never contains secrets. */
export class AiProviderError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export interface AiRequest {
  task: AiTask;
  system: string;
  prompt: string;
  /** Hard ceiling for the call. Providers must honour it. */
  timeoutMs: number;
}

export interface AiResponse {
  /** Raw JSON text (or an object) produced by the provider. The caller validates it with Zod. */
  json: unknown;
  provider: string;
  model: string | null;
  /** True whenever the content came from the deterministic demo provider rather than a real model. */
  simulated: boolean;
}

/**
 * Provider-neutral generation interface. Providers get both the typed `task` (used by the
 * deterministic demo provider) and a rendered `system`/`prompt` pair (used by real LLMs).
 * Providers never validate or trust citations; that is done server-side after the call.
 * Providers must NOT retry on their own: a retry could double-charge, so the caller decides.
 */
export interface AiProvider {
  readonly id: string;
  readonly label: string;
  readonly simulated: boolean;
  generate(req: AiRequest): Promise<AiResponse>;
}
