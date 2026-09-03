import { clamp } from '../types.js';
import type { AIProvider, JurorEvaluationInput, JurorEvaluationOutput } from './provider.js';

/**
 * Zero-dependency fallback "agent". No network, fully deterministic for a
 * given (juror, event) pair, so the app is demoable before any API key exists
 * and the UI has something to animate. It models the same trait effects the
 * LLM prompt asks for, just arithmetically.
 */
export class HeuristicProvider implements AIProvider {
  readonly name = 'heuristic';

  isConfigured(): boolean {
    return true;
  }

  async evaluate(input: JurorEvaluationInput): Promise<JurorEvaluationOutput> {
    const { juror, event, current } = input;
    const t = juror.traits;

    const direction = event.side === 'prosecution' ? 1 : event.side === 'defence' ? -1 : 0;

    // How much this juror credits the item at all.
    let credit = event.strength;
    credit *= 1 - 0.45 * t.skepticism;                    // sceptics discount everything
    credit += event.authority * t.authorityTrust * 0.35;   // authority sources land harder on trusters
    credit += event.emotional * (0.3 * t.emotionality + 0.25 * t.empathy);
    credit -= event.emotional * 0.25 * t.analytical;       // analysts discount emotional appeals
    credit = clamp(credit, 0, 1.2);

    // Stable per-(juror,event) jitter so agents differ without being random.
    const jitter = (hash(`${juror.id}:${event.id}`) % 1000) / 1000 - 0.5;
    const idiosyncrasy = jitter * (0.25 + 0.3 * t.independence);

    const prior = current?.lean ?? 0;
    const pull = direction * credit * 0.55 + idiosyncrasy;
    const lean = clamp(prior + pull, -1, 1);

    const priorConfidence = current?.confidence ?? 0.3;
    const confidence = clamp(
      priorConfidence + credit * 0.15 + 0.1 * t.analytical - 0.08 * t.skepticism,
      0.05,
      0.97,
    );

    return {
      lean,
      confidence,
      reasoning: this.narrate(input, direction, credit, lean),
      keyFactors: this.factors(input, credit),
    };
  }

  private narrate(
    input: JurorEvaluationInput,
    direction: number,
    credit: number,
    lean: number,
  ): string {
    const { juror, event } = input;
    const t = juror.traits;
    const weight = credit > 0.6 ? 'weighs heavily' : credit > 0.3 ? 'matters' : 'barely moves me';
    const stance = lean > 0.2 ? 'toward guilty' : lean < -0.2 ? 'toward not guilty' : 'still undecided';

    const lens =
      t.analytical > 0.7
        ? 'I am tracking whether the timeline actually holds together'
        : t.empathy > 0.7
          ? 'I keep coming back to what this means for the people involved'
          : t.skepticism > 0.7
            ? 'I want corroboration before I accept any of it'
            : t.authorityTrust > 0.7
              ? 'I put real weight on what the officials and experts stated'
              : 'I am trying to keep an even keel about it';

    const side = direction > 0 ? 'the prosecution' : direction < 0 ? 'the defence' : 'neither side';

    return `"${event.title}" ${weight} for me. ${lens}, and this came from ${side}, which leaves me ${stance}. [simulated reasoning — heuristic provider, no LLM configured]`;
  }

  private factors(input: JurorEvaluationInput, credit: number): string[] {
    const { juror, event } = input;
    const t = juror.traits;
    const out: string[] = [`${event.kind} — ${event.title}`];
    if (event.authority > 0.5 && t.authorityTrust > 0.5) out.push('credible official source');
    if (event.emotional > 0.5 && t.empathy > 0.6) out.push('emotional weight of testimony');
    if (t.skepticism > 0.6) out.push('wants corroboration');
    if (t.analytical > 0.7) out.push('consistency of the account');
    if (credit < 0.3) out.push('low probative value to me');
    return out.slice(0, 4);
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
