import { evaluateJuror } from '../ai/index.js';
import {
  clamp,
  leaningOf,
  type ChangeAttribution,
  type InfluenceEdge,
  type Juror,
  type JurorPosition,
  type JurySnapshot,
  type TrialEvent,
} from '../types.js';
import { baseOpenness, dispositionBias, persuasiveness, susceptibility } from './personalities.js';

export interface SimulationContext {
  caseSummary: string;
  charge: string;
  defendant: string;
  jurors: Juror[];
  history: TrialEvent[];
  event: TrialEvent;
  previous: Map<string, JurorPosition>;
  round: number;
  /** Peer-influence passes to run after evidence intake. */
  deliberationPasses?: number;
}

export interface SimulationResult {
  positions: JurorPosition[];
  influences: InfluenceEdge[];
  snapshot: JurySnapshot;
}

/**
 * One full round: every juror independently re-evaluates (their own agent
 * call), then they argue and pull on each other, then we aggregate.
 */
export async function runRound(ctx: SimulationContext): Promise<SimulationResult> {
  const { jurors, event, round, previous } = ctx;
  const passes = ctx.deliberationPasses ?? Number(process.env.DELIBERATION_PASSES || 2);

  /* -------- phase 1: independent evaluation, one agent per juror -------- */

  const evaluations = await mapWithConcurrency(
    jurors,
    Number(process.env.AI_CONCURRENCY || 6),
    (juror) =>
      evaluateJuror({
        juror,
        caseSummary: ctx.caseSummary,
        charge: ctx.charge,
        defendant: ctx.defendant,
        history: ctx.history,
        event,
        current: previous.get(juror.id) ?? null,
      }),
  );

  // Blend each agent's proposal with its prior position, gated by traits and
  // by the character of the evidence itself.
  const working = jurors.map((juror, i) => {
    const prior = previous.get(juror.id);
    const priorLean = prior?.lean ?? 0;
    const priorConfidence = prior?.confidence ?? 0.25;
    const evaluation = evaluations[i];
    const t = juror.traits;

    let openness = baseOpenness(t);
    openness += event.emotional * (0.3 * t.empathy + 0.22 * t.emotionality);
    openness -= event.emotional * 0.2 * t.analytical;
    openness += event.authority * 0.28 * t.authorityTrust;
    openness -= event.authority * 0.18 * (1 - t.authorityTrust);
    openness *= 0.4 + 0.6 * event.strength;
    openness = clamp(openness, 0.05, 0.92);

    // The agent's own conclusion, tilted by who this juror is.
    const target = clamp(evaluation.lean + dispositionBias(t), -1, 1);
    const lean = clamp(priorLean + openness * (target - priorLean), -1, 1);

    const confidenceAfterEvidence = clamp(
      priorConfidence + openness * (evaluation.confidence - priorConfidence),
      0.05,
      0.93,
    );

    return {
      juror,
      priorLean,
      priorConfidence,
      lean,
      leanAfterEvidence: lean,
      confidence: confidenceAfterEvidence,
      confidenceAfterEvidence,
      /** Agreement/dissonance accumulated across deliberation passes. */
      agreementShift: 0,
      reasoning: evaluation.reasoning,
      keyFactors: evaluation.keyFactors,
    };
  });

  /* ----------- phase 2: deliberation — jurors influence each other ----------- */

  const edgeTotals = new Map<string, number>();

  for (let pass = 0; pass < passes; pass++) {
    const snapshotOfPass = working.map((w) => ({ lean: w.lean, confidence: w.confidence }));

    working.forEach((self, i) => {
      const t = self.juror.traits;
      let weightSum = 0;
      let weightedLean = 0;
      const contributions: Array<{ fromId: string; signed: number }> = [];

      working.forEach((peer, j) => {
        if (i === j) return;
        const peerState = snapshotOfPass[j];
        const disagreement = Math.abs(peerState.lean - snapshotOfPass[i].lean) / 2;

        // Sceptics and independents discount voices they already disagree with.
        const affinity = 1 - disagreement * (0.5 * t.skepticism + 0.3 * t.independence);
        const weight =
          persuasiveness(peer.juror.traits, peerState.confidence) * Math.max(0.05, affinity);

        weightSum += weight;
        weightedLean += weight * peerState.lean;
        contributions.push({ fromId: peer.juror.id, signed: weight * (peerState.lean - snapshotOfPass[i].lean) });
      });

      if (weightSum === 0) return;

      const groupLean = weightedLean / weightSum;
      const move =
        susceptibility(t, snapshotOfPass[i].confidence) * (groupLean - snapshotOfPass[i].lean) * 0.45;

      self.lean = clamp(self.lean + move, -1, 1);

      // Agreement in the room firms people up; disagreement unsettles them.
      // This accumulates only within the round — each round re-anchors to the
      // juror's own evaluated confidence, so it cannot ratchet to 1.0 over time.
      const dissonance = Math.abs(groupLean - snapshotOfPass[i].lean) / 2;
      self.agreementShift += 0.06 * (1 - 2 * dissonance) * (0.5 + 0.5 * t.independence);

      // Attribute the movement to the peers who pulled hardest in that direction.
      if (Math.abs(move) > 0.002) {
        const aligned = contributions.filter((c) => Math.sign(c.signed) === Math.sign(move));
        const total = aligned.reduce((s, c) => s + Math.abs(c.signed), 0);
        if (total > 0) {
          for (const c of aligned) {
            const share = (Math.abs(c.signed) / total) * move;
            if (Math.abs(share) < 0.002) continue;
            const key = `${c.fromId}->${self.juror.id}`;
            edgeTotals.set(key, (edgeTotals.get(key) ?? 0) + share);
          }
        }
      }
    });
  }

  // Settle confidence: anchor on the juror's own reading of the evidence, then
  // apply a bounded adjustment for how the room received it.
  for (const self of working) {
    self.confidence = clamp(
      self.confidenceAfterEvidence + clamp(self.agreementShift, -0.15, 0.15),
      0.05,
      0.93,
    );
  }

  /* --------------------------- phase 3: aggregate --------------------------- */

  const positions: JurorPosition[] = working.map((w) => {
    const evidenceDelta = w.leanAfterEvidence - w.priorLean;
    const peerDelta = w.lean - w.leanAfterEvidence;
    return {
      jurorId: w.juror.id,
      round,
      lean: round2(w.lean),
      leaning: leaningOf(w.lean),
      confidence: round2(w.confidence),
      reasoning: w.reasoning,
      keyFactors: w.keyFactors,
      delta: round2(w.lean - w.priorLean),
      evidenceDelta: round2(evidenceDelta),
      peerDelta: round2(peerDelta),
    };
  });

  const influences: InfluenceEdge[] = [...edgeTotals.entries()]
    .map(([key, magnitude]) => {
      const [fromJurorId, toJurorId] = key.split('->');
      return { round, fromJurorId, toJurorId, magnitude: round2(magnitude) };
    })
    .filter((e) => Math.abs(e.magnitude) >= 0.005)
    .sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude))
    .slice(0, 24);

  return { positions, influences, snapshot: aggregate(positions, round, event.id) };
}

export function aggregate(
  positions: JurorPosition[],
  round: number,
  eventId: string | null,
): JurySnapshot {
  const n = positions.length || 1;
  const guilty = positions.filter((p) => p.leaning === 'guilty').length;
  const notGuilty = positions.filter((p) => p.leaning === 'not_guilty').length;
  const uncertain = n - guilty - notGuilty;

  const juryLean = positions.reduce((s, p) => s + p.lean, 0) / n;
  const confidence = positions.reduce((s, p) => s + p.confidence, 0) / n;
  const largestBloc = Math.max(guilty, notGuilty, uncertain);

  return {
    round,
    eventId,
    juryLean: round2(juryLean),
    guiltyPct: round2((guilty / n) * 100),
    notGuiltyPct: round2((notGuilty / n) * 100),
    uncertainPct: round2((uncertain / n) * 100),
    consensus: round2(largestBloc / n),
    confidence: round2(confidence),
    unanimous: guilty === n || notGuilty === n,
    createdAt: new Date().toISOString(),
  };
}

/** Builds the "Why did the jury change?" explanation for a round. */
export function explainChange(
  jurors: Juror[],
  event: TrialEvent | null,
  positions: JurorPosition[],
  influences: InfluenceEdge[],
  current: JurySnapshot,
  previous: JurySnapshot | null,
): ChangeAttribution {
  const nameOf = new Map(jurors.map((j) => [j.id, j.name]));
  const leanDelta = round2(current.juryLean - (previous?.juryLean ?? 0));
  const consensusDelta = round2(current.consensus - (previous?.consensus ?? 0));

  const topMovers = [...positions]
    .filter((p) => Math.abs(p.delta) >= 0.01)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4)
    .map((p) => ({
      jurorId: p.jurorId,
      name: nameOf.get(p.jurorId) ?? 'Unknown juror',
      delta: p.delta,
      evidenceDelta: p.evidenceDelta,
      peerDelta: p.peerDelta,
      reasoning: p.reasoning,
    }));

  const topInfluencers = influences.slice(0, 5).map((e) => ({
    fromJurorId: e.fromJurorId,
    fromName: nameOf.get(e.fromJurorId) ?? 'Unknown juror',
    toJurorId: e.toJurorId,
    toName: nameOf.get(e.toJurorId) ?? 'Unknown juror',
    magnitude: e.magnitude,
  }));

  const dir = leanDelta > 0.01 ? 'toward guilty' : leanDelta < -0.01 ? 'toward not guilty' : 'roughly unchanged';
  const size = Math.abs(leanDelta) > 0.25 ? 'sharply' : Math.abs(leanDelta) > 0.08 ? 'noticeably' : 'slightly';

  const evidenceShare = positions.reduce((s, p) => s + Math.abs(p.evidenceDelta), 0);
  const peerShare = positions.reduce((s, p) => s + Math.abs(p.peerDelta), 0);
  const driver =
    evidenceShare === 0 && peerShare === 0
      ? 'no measurable movement'
      : evidenceShare > peerShare * 1.5
        ? 'driven mainly by the evidence itself'
        : peerShare > evidenceShare * 1.5
          ? 'driven mainly by peer pressure in deliberation'
          : 'driven by a mix of the evidence and peer influence';

  const headline =
    dir === 'roughly unchanged'
      ? `The jury held steady after "${event?.title ?? 'deliberation'}" — ${driver}.`
      : `"${event?.title ?? 'Deliberation'}" moved the jury ${size} ${dir} — ${driver}.`;

  return { round: current.round, event, leanDelta, consensusDelta, headline, topMovers, topInfluencers };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Small concurrency limiter so 12 agents don't all hit rate limits at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
