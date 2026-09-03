import {
  buildPrompt,
  parseEvaluation,
  type AIProvider,
  type JurorEvaluationInput,
  type JurorEvaluationOutput,
} from './provider.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface RetryableError extends Error {
  status?: number;
  retryAfterMs?: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Groq states the wait in the body ("Please try again in 393.84ms") and
 * sometimes in a Retry-After header. Honouring it beats guessing.
 */
function parseRetryAfter(header: string | null, body: string): number | null {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000);
  }
  const m = body.match(/try again in ([\d.]+)(ms|s)\b/i);
  if (m) {
    const value = Number(m[1]);
    if (Number.isFinite(value)) return Math.ceil(m[2].toLowerCase() === 's' ? value * 1000 : value);
  }
  return null;
}

/**
 * Reasoning models (gpt-oss, o-series) spend the completion budget on hidden
 * reasoning before emitting anything. Left at a chat-sized max_tokens they
 * return an empty or truncated document instead of the JSON.
 */
function isReasoningModel(model: string): boolean {
  return /gpt-oss|^o[1-4](-|$)|reasoning/i.test(model);
}

/** Returns how long to wait, or null when the error is not worth retrying. */
function retryDelayMs(err: Error, attempt: number): number | null {
  const status = (err as RetryableError).status;
  // A failed JSON generation is stochastic, not a bad request — resampling
  // usually succeeds, so it is worth another go.
  const jsonWobble = status === 400 && /json[_ ](validate|generate)|Failed to (validate|generate) JSON/i.test(err.message);
  const retryable =
    status === 429 || status === 408 || jsonWobble || (status !== undefined && status >= 500);
  if (!retryable) return null;

  const stated = (err as RetryableError).retryAfterMs;
  // Exponential backoff with jitter, floored by whatever the API asked for.
  const backoff = Math.min(8000, 400 * 2 ** attempt) + Math.random() * 250;
  return Math.max(stated ?? 0, backoff);
}

/**
 * Groq adapter. Groq exposes an OpenAI-compatible chat-completions endpoint,
 * so this same class works for any OpenAI-shaped API by overriding
 * AI_BASE_URL — that is the intended escape hatch for swapping providers.
 */
export class GroqProvider implements AIProvider {
  readonly name = 'groq';

  private get apiKey(): string | undefined {
    return process.env.GROQ_API_KEY;
  }

  private get model(): string {
    return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  }

  private get url(): string {
    return process.env.AI_BASE_URL || GROQ_URL;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim());
  }

  async evaluate(input: JurorEvaluationInput): Promise<JurorEvaluationOutput> {
    const attempts = Number(process.env.AI_MAX_RETRIES || 6);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await this.callOnce(input);
      } catch (err) {
        lastError = err as Error;
        const wait = retryDelayMs(lastError, attempt);
        // Only 429s and transient 5xx are worth retrying; anything else is a
        // real error and retrying just wastes the juror's turn.
        if (wait === null || attempt === attempts - 1) throw lastError;
        await sleep(wait);
      }
    }

    throw lastError ?? new Error('Groq call failed');
  }

  private async callOnce(input: JurorEvaluationInput): Promise<JurorEvaluationOutput> {
    const { system, user } = buildPrompt(input);

    // Trait-linked sampling: analytical jurors reason more deterministically,
    // emotional ones more variably. Keeps agents feeling distinct.
    const t = input.juror.traits;
    const temperature = Math.min(1.1, Math.max(0.2, 0.75 - 0.4 * t.analytical + 0.4 * t.emotionality));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 30000));

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature,
          // Reasoning models need headroom for the thinking they do before the
          // answer; a chat-sized budget yields empty documents.
          max_tokens: Number(
            process.env.AI_MAX_TOKENS || (isReasoningModel(this.model) ? 2500 : 900),
          ),
          ...(isReasoningModel(this.model)
            ? { reasoning_effort: process.env.AI_REASONING_EFFORT || 'low' }
            : {}),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        const error = new Error(`Groq ${res.status}: ${body.slice(0, 300)}`) as RetryableError;
        error.status = res.status;
        error.retryAfterMs = parseRetryAfter(res.headers.get('retry-after'), body);
        throw error;
      }

      const json = (await res.json()) as any;
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Groq returned no message content');

      return parseEvaluation(content);
    } finally {
      clearTimeout(timeout);
    }
  }
}
