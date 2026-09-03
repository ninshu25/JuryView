/**
 * NOTaJury shared domain types.
 *
 * DISCLAIMER: every structure here describes a *simulation* of deliberation
 * behaviour. Nothing produced by this system is a determination of guilt or
 * innocence, legal advice, or a prediction about a real proceeding.
 */

/** All traits are normalised to 0..1. */
export interface JurorTraits {
  skepticism: number;
  empathy: number;
  analytical: number;
  emotionality: number;
  authorityTrust: number;
  independence: number;
  suggestibility: number;
}

export type TraitKey = keyof JurorTraits;

export const TRAIT_KEYS: TraitKey[] = [
  'skepticism',
  'empathy',
  'analytical',
  'emotionality',
  'authorityTrust',
  'independence',
  'suggestibility',
];

export interface Juror {
  id: string;
  caseId: string;
  seat: number;
  name: string;
  archetype: string;
  bio: string;
  traits: JurorTraits;
}

export type Leaning = 'guilty' | 'not_guilty' | 'uncertain';

export interface JurorPosition {
  jurorId: string;
  round: number;
  /** -1 = strongly not guilty, +1 = strongly guilty. */
  lean: number;
  leaning: Leaning;
  confidence: number;
  reasoning: string;
  keyFactors: string[];
  /** Change in `lean` versus the previous round. */
  delta: number;
  /** How much of `delta` came from the evidence vs. from peers. */
  evidenceDelta: number;
  peerDelta: number;
}

export type EventKind =
  | 'evidence'
  | 'testimony'
  | 'argument'
  | 'instruction'
  | 'objection'
  | 'cross_examination';

export type Side = 'prosecution' | 'defence' | 'neutral';

export type SpeakerRole =
  | 'prosecution'
  | 'defence'
  | 'witness'
  | 'judge'
  | 'defendant'
  /** A reporter's aside rather than spoken words. */
  | 'narration'
  | 'other';

/** One line of court dialogue, e.g. `Cini: Had you deleted WhatsApp?` */
export interface TranscriptLine {
  speaker: string;
  role: SpeakerRole;
  text: string;
}

export interface TrialEvent {
  id: string;
  caseId: string;
  round: number;
  kind: EventKind;
  title: string;
  content: string;
  side: Side;
  /** Objective probative force, 0..1. */
  strength: number;
  /** How emotionally charged the material is, 0..1. */
  emotional: number;
  /** How much it leans on an authority/expert/official source, 0..1. */
  authority: number;
  /** Verbatim exchange, when the event was entered as a transcript. */
  transcript: TranscriptLine[];
  createdAt: string;
}

export interface InfluenceEdge {
  round: number;
  /** The juror doing the persuading. */
  fromJurorId: string;
  /** The juror being moved. */
  toJurorId: string;
  /** Signed magnitude of the shift attributed to this peer. */
  magnitude: number;
}

export interface JurySnapshot {
  round: number;
  eventId: string | null;
  /** Mean juror lean, -1..+1. */
  juryLean: number;
  guiltyPct: number;
  notGuiltyPct: number;
  uncertainPct: number;
  /** Share held by the largest bloc, 0..1. */
  consensus: number;
  confidence: number;
  /** True when every juror sits in the same non-uncertain bloc. */
  unanimous: boolean;
  createdAt: string;
}

export interface ChangeAttribution {
  round: number;
  event: TrialEvent | null;
  leanDelta: number;
  consensusDelta: number;
  headline: string;
  topMovers: Array<{
    jurorId: string;
    name: string;
    delta: number;
    evidenceDelta: number;
    peerDelta: number;
    reasoning: string;
  }>;
  topInfluencers: Array<{
    fromJurorId: string;
    fromName: string;
    toJurorId: string;
    toName: string;
    magnitude: number;
  }>;
}

export interface CaseRecord {
  id: string;
  title: string;
  summary: string;
  defendant: string;
  charge: string;
  round: number;
  /**
   * Set when the material comes from a real proceeding involving identifiable
   * people. Drives a stronger on-screen warning — a simulated "72% guilty"
   * about a real defendant is a very different object from one about a made-up
   * one, and the UI should never let the two look alike.
   */
  realCase: boolean;
  /** Where the transcripts came from, e.g. a court reporting live blog. */
  sourceNote: string;
  createdAt: string;
}

export interface CaseState {
  case: CaseRecord;
  jurors: Juror[];
  positions: JurorPosition[];
  events: TrialEvent[];
  snapshots: JurySnapshot[];
  history: JurorPosition[];
  influences: InfluenceEdge[];
  lastChange: ChangeAttribution | null;
  aiProvider: string;
  disclaimer: string;
}

export const DISCLAIMER =
  'AI SIMULATION — these are synthetic agents modelling deliberation dynamics. ' +
  'Output is not a determination of guilt or innocence and has no legal weight.';

export function leaningOf(lean: number): Leaning {
  if (lean > 0.2) return 'guilty';
  if (lean < -0.2) return 'not_guilty';
  return 'uncertain';
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
