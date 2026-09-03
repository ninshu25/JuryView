import { transcriptToText } from '../sim/transcript.js';
import type { Juror, JurorPosition, TrialEvent } from '../types.js';

/**
 * The whole AI surface of NOTaJury is this one interface. Swap in any LLM by
 * writing a module that satisfies it and registering it in ./index.ts —
 * nothing in the simulation engine needs to change.
 */
export interface JurorEvaluationInput {
  juror: Juror;
  caseSummary: string;
  charge: string;
  defendant: string;
  /** Everything the juror has already heard, oldest first. */
  history: TrialEvent[];
  /** The new material prompting this re-evaluation. */
  event: TrialEvent;
  /** The juror's position going into this round, if any. */
  current: JurorPosition | null;
}

export interface JurorEvaluationOutput {
  /** -1 = strongly not guilty, +1 = strongly guilty. */
  lean: number;
  confidence: number;
  reasoning: string;
  keyFactors: string[];
}

export interface AIProvider {
  readonly name: string;
  /** False when credentials are missing; the registry then falls back. */
  isConfigured(): boolean;
  evaluate(input: JurorEvaluationInput): Promise<JurorEvaluationOutput>;
}

/** Shared prompt construction so every provider frames the task identically. */
export function buildPrompt(input: JurorEvaluationInput): { system: string; user: string } {
  const { juror, event, current, history, caseSummary, charge, defendant } = input;
  const t = juror.traits;

  const system = [
    'You are role-playing a single fictional juror inside an explicitly labelled AI SIMULATION.',
    'This is a research/visualisation tool. Your output is never a real determination of guilt.',
    '',
    `You are ${juror.name}, "${juror.archetype}". ${juror.bio}`,
    '',
    'Your personality traits, each 0.0 (absent) to 1.0 (dominant):',
    `- skepticism ${t.skepticism.toFixed(2)}: how much you demand corroboration before believing a claim.`,
    `- empathy ${t.empathy.toFixed(2)}: how much the human situation of the parties weighs on you.`,
    `- analytical ${t.analytical.toFixed(2)}: how much you reason from structure, chronology and consistency.`,
    `- emotionality ${t.emotionality.toFixed(2)}: how strongly emotionally charged material affects your read.`,
    `- authorityTrust ${t.authorityTrust.toFixed(2)}: how much weight you give experts, police and officials.`,
    `- independence ${t.independence.toFixed(2)}: how willing you are to hold a minority position.`,
    `- suggestibility ${t.suggestibility.toFixed(2)}: how readily a confident peer shifts your view.`,
    '',
    'Reason strictly in character. A high-skepticism juror should not be swayed by a bare assertion;',
    'a high-empathy juror should visibly weigh the human cost; a highly analytical juror should cite',
    'specific inconsistencies. Stay within the evidence presented — invent no new facts.',
    '',
    'Respond with ONLY a JSON object of this exact shape:',
    '{"lean": <number -1..1>, "confidence": <number 0..1>, "reasoning": "<2-3 sentences, first person>", "keyFactors": ["<short phrase>", "..."]}',
    'lean: -1 = certain NOT GUILTY, 0 = genuinely undecided, +1 = certain GUILTY.',
    'confidence: how sure you are of your own position, independent of its direction.',
    '',
    'HARD LIMITS — the response is truncated past them, so stay well inside:',
    '- "reasoning" must be at most 45 words. No preamble, no restating the evidence.',
    '- "keyFactors" must be at most 3 entries, each at most 6 words.',
    '- Emit the JSON object and nothing else.',
  ].join('\n');

  const priorHistory = summariseHistory(history);

  const currentPos = current
    ? `Your position before this item: lean ${current.lean.toFixed(2)} (${current.leaning}), confidence ${current.confidence.toFixed(2)}.\nYou previously reasoned: "${current.reasoning}"`
    : 'You have not formed a position yet. Begin from the presumption of innocence.';

  const user = [
    `CASE: ${input.caseSummary ? caseSummary : '(no summary provided)'}`,
    `DEFENDANT: ${defendant || '(unnamed)'}`,
    `CHARGE: ${charge || '(unspecified)'}`,
    '',
    'WHAT YOU HAVE HEARD SO FAR:',
    priorHistory,
    '',
    currentPos,
    '',
    'NEW ITEM JUST PRESENTED:',
    `[${event.kind} — offered by the ${event.side}] ${event.title}`,
    event.content,
    ...(event.transcript?.length
      ? [
          '',
          'VERBATIM EXCHANGE IN OPEN COURT (square brackets are the reporter, not speech):',
          transcriptToText(event.transcript),
          '',
          'Weigh what was actually said and how it was said — hesitation, evasion, a',
          'concession under pressure, or a straight answer. Do not invent anything',
          'outside these lines.',
        ]
      : []),
    '',
    'Re-evaluate your position in light of this new item. Return only the JSON object.',
  ].join('\n');

  return { system, user };
}

/** Recent items are quoted in full; everything older collapses to a title. */
const HISTORY_FULL = Number(process.env.AI_HISTORY_FULL || 5);
const HISTORY_CHARS = Number(process.env.AI_HISTORY_CHARS || 700);

/**
 * Keeps the prompt bounded as a trial gets long.
 *
 * Sending every prior event in full grows the prompt without limit — by round
 * 20 of a live-blog ingest that was ~14k tokens per juror, 12 jurors deep,
 * which blows a per-minute token budget and gets worse every round. Jurors do
 * need continuity, but they need the recent record verbatim and only the shape
 * of what came before.
 */
function summariseHistory(history: TrialEvent[]): string {
  if (history.length === 0) return '(nothing yet — this is the first item presented)';

  const cut = Math.max(0, history.length - HISTORY_FULL);
  const earlier = history.slice(0, cut);
  const recent = history.slice(cut);
  const lines: string[] = [];

  if (earlier.length) {
    lines.push(`Earlier in the trial (${earlier.length} items, titles only):`);
    for (const [i, e] of earlier.entries()) {
      lines.push(`  ${i + 1}. [${e.kind}/${e.side}] ${e.title}`);
    }
    lines.push('');
  }

  lines.push(recent.length === history.length ? 'What you have heard:' : 'Most recently:');
  for (const [i, e] of recent.entries()) {
    const body =
      e.content.length > HISTORY_CHARS ? `${e.content.slice(0, HISTORY_CHARS)}…` : e.content;
    lines.push(`  ${cut + i + 1}. [${e.kind}/${e.side}] ${e.title}: ${body}`);
  }

  return lines.join('\n');
}

/** Defensive parse — LLMs sometimes wrap JSON in prose or fences. */
export function parseEvaluation(raw: string): JurorEvaluationOutput {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`no JSON object in model output: ${raw.slice(0, 200)}`);

  const parsed = JSON.parse(text.slice(start, end + 1));
  const lean = Number(parsed.lean);
  const confidence = Number(parsed.confidence);

  return {
    lean: Number.isFinite(lean) ? Math.min(1, Math.max(-1, lean)) : 0,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.4,
    reasoning: String(parsed.reasoning ?? '').slice(0, 800) || 'No reasoning returned.',
    keyFactors: Array.isArray(parsed.keyFactors)
      ? parsed.keyFactors.slice(0, 5).map((f: unknown) => String(f).slice(0, 120))
      : [],
  };
}
