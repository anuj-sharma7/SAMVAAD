import { AiProviderError, type AiProvider, type AiRequest, type AiResponse } from "./provider";

/**
 * Real provider: Anthropic Messages API over plain `fetch` (no SDK dependency).
 *
 * - The key is read from the server environment only; it is never logged, returned or sent to the client.
 * - One attempt per call. No automatic retries (a retry after a timeout could be billed twice).
 * - Every failure is mapped to an `AiProviderError` with a mentor-safe message.
 */
export function createAnthropicProvider(opts: { apiKey: string; model: string; baseUrl?: string }): AiProvider {
  const base = (opts.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
  return {
    id: "anthropic",
    label: `Anthropic (${opts.model})`,
    simulated: false,
    async generate(req: AiRequest): Promise<AiResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs);
      let res: Response;
      try {
        res = await fetch(`${base}/v1/messages`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": opts.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: 1500,
            temperature: 0.2,
            system: req.system,
            messages: [{ role: "user", content: req.prompt }],
          }),
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          throw new AiProviderError("timeout", "The AI service took too long to respond. Nothing was saved.");
        }
        throw new AiProviderError("provider_error", "Could not reach the AI service. Check your connection.");
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        // Read the error type only; never echo request headers or the key.
        let detail = "";
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          detail = body.error?.message ?? "";
        } catch {
          /* ignore */
        }
        if (res.status === 401 || res.status === 403) {
          throw new AiProviderError("invalid_credentials", "The AI service rejected the configured credentials.");
        }
        if (res.status === 429) {
          throw new AiProviderError("rate_limited", "The AI service is rate limiting requests. Please try again shortly.");
        }
        if (res.status === 402 || /credit balance|billing/i.test(detail)) {
          throw new AiProviderError("insufficient_credits", "The AI account has insufficient credits.");
        }
        throw new AiProviderError("provider_error", `The AI service returned an error (HTTP ${res.status}).`);
      }

      let data: { content?: { type: string; text?: string }[]; model?: string };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // e.g. a captive portal or proxy answering 200 with HTML
        throw new AiProviderError("malformed_output", "The AI service returned a response that was not valid JSON.");
      }
      const text = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
      const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      try {
        return { json: JSON.parse(stripped), provider: "anthropic", model: data.model ?? opts.model, simulated: false };
      } catch {
        throw new AiProviderError("malformed_output", "The AI service returned a response that was not valid JSON.");
      }
    },
  };
}
