/** Mirrors server/src/types.ts. Kept as a plain copy to avoid build coupling. */

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

export const TRAIT_LABELS: Record<TraitKey, string> = {
  skepticism: 'Skepticism',
  empathy: 'Empathy',
  analytical: 'Analytical',
  emotionality: 'Emotionality',
  authorityTrust: 'Authority trust',
  independence: 'Independence',
  suggestibility: 'Suggestibility',
};

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
  lean: number;
  leaning: Leaning;
  confidence: number;
  reasoning: string;
  keyFactors: string[];
  delta: number;
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
  | 'narration'
  | 'other';

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
  strength: number;
  emotional: number;
  authority: number;
  transcript: TranscriptLine[];
  createdAt: string;
}

export interface InfluenceEdge {
  round: number;
  fromJurorId: string;
  toJurorId: string;
  magnitude: number;
}

export interface JurySnapshot {
  round: number;
  eventId: string | null;
  juryLean: number;
  guiltyPct: number;
  notGuiltyPct: number;
  uncertainPct: number;
  consensus: number;
  confidence: number;
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
  realCase: boolean;
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

export interface SuggestedEvent {
  kind: EventKind;
  side: Side;
  title: string;
  content: string;
  strength: number;
  emotional: number;
  authority: number;
  /** Raw court-reporting text; the server parses it into speaker lines. */
  transcriptText?: string;
}

export const LEANING_LABELS: Record<Leaning, string> = {
  guilty: 'Guilty',
  not_guilty: 'Not guilty',
  uncertain: 'Uncertain',
};
