import { GroqProvider } from './groq.js';
import { HeuristicProvider } from './heuristic.js';
import type { AIProvider, JurorEvaluationInput, JurorEvaluationOutput } from './provider.js';

export type { AIProvider, JurorEvaluationInput, JurorEvaluationOutput };

/**
 * Provider registry. To add your own LLM: implement AIProvider, add it here,
 * and set AI_PROVIDER in .env. Nothing else in the codebase changes.
 */
const registry: Record<string, () => AIProvider> = {
  groq: () => new GroqProvider(),
  heuristic: () => new HeuristicProvider(),
};

const fallback = new HeuristicProvider();
let active: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (active) return active;

  const requested = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  const factory = registry[requested];

  if (!factory) {
    console.warn(`[ai] unknown AI_PROVIDER "${requested}" — falling back to heuristic`);
    active = fallback;
  } else {
    const provider = factory();
    if (!provider.isConfigured()) {
      console.warn(
        `[ai] provider "${requested}" is not configured (missing API key) — ` +
          'running the built-in heuristic agents instead',
      );
      active = fallback;
    } else {
      console.log(`[ai] using provider "${provider.name}"`);
      active = provider;
    }
  }
  return active;
}

export function activeProviderName(): string {
  return getProvider().name;
}

/**
 * Degrading to the heuristic keeps a run alive but silently lowers its
 * quality, so the count is tracked and reported rather than buried in logs.
 */
const stats = { calls: 0, fallbacks: 0 };

export function providerStats(): { calls: number; fallbacks: number } {
  return { ...stats };
}

export function resetProviderStats(): void {
  stats.calls = 0;
  stats.fallbacks = 0;
}

/**
 * Runs one agent. Any provider failure degrades to the heuristic for that
 * juror alone, so a single bad API call never takes down a deliberation.
 */
export async function evaluateJuror(input: JurorEvaluationInput): Promise<JurorEvaluationOutput> {
  const provider = getProvider();
  stats.calls++;
  try {
    return await provider.evaluate(input);
  } catch (err) {
    stats.fallbacks++;
    console.warn(
      `[ai] ${provider.name} failed for ${input.juror.name}: ${(err as Error).message} — using heuristic`,
    );
    return fallback.evaluate(input);
  }
}
