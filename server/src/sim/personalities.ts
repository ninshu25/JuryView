import { randomUUID } from 'node:crypto';
import type { Juror, JurorTraits } from '../types.js';

interface Archetype {
  name: string;
  archetype: string;
  bio: string;
  traits: JurorTraits;
}

/**
 * Twelve deliberately contrasting personality profiles, named to read as a
 * Maltese jury. The surnames are deliberately chosen to avoid any party,
 * counsel or witness appearing in the proceedings this tool is pointed at —
 * a synthetic juror must never share a name with a real participant.
 *
 * Twelve deliberately contrasting personality profiles. Traits are 0..1 and
 * drive both how each agent reads new evidence and how much it moves when
 * peers push back. These are fictional composites, not real people.
 */
export const ARCHETYPES: Archetype[] = [
  {
    name: 'Juror 1 — Marija Camilleri',
    archetype: 'The Foreperson',
    bio: 'Retired head of a Birkirkara primary school. Keeps the room orderly and expects everyone to say their reasoning out loud.',
    traits: { skepticism: 0.5, empathy: 0.6, analytical: 0.7, emotionality: 0.4, authorityTrust: 0.6, independence: 0.7, suggestibility: 0.3 },
  },
  {
    name: 'Juror 2 — Ġorġ Micallef',
    archetype: 'The Engineer',
    bio: 'Structural engineer from Żebbuġ. Wants the chain of evidence to hold together like a load path, and distrusts anything unquantified.',
    traits: { skepticism: 0.75, empathy: 0.3, analytical: 0.95, emotionality: 0.15, authorityTrust: 0.5, independence: 0.8, suggestibility: 0.15 },
  },
  {
    name: 'Juror 3 — Rita Buttigieg',
    archetype: 'The Empath',
    bio: 'Paediatric nurse at Mater Dei. Reads people before she reads documents, and feels the weight of testimony personally.',
    traits: { skepticism: 0.3, empathy: 0.95, analytical: 0.4, emotionality: 0.85, authorityTrust: 0.5, independence: 0.4, suggestibility: 0.6 },
  },
  {
    name: 'Juror 4 — Karmnu Sciberras',
    archetype: 'The Hard-Liner',
    bio: 'Former dockyard foreman in Cospicua. Believes charges are rarely brought without cause, and has little patience for hypotheticals.',
    traits: { skepticism: 0.45, empathy: 0.2, analytical: 0.5, emotionality: 0.35, authorityTrust: 0.9, independence: 0.6, suggestibility: 0.25 },
  },
  {
    name: 'Juror 5 — Antoinette Xuereb',
    archetype: 'The Contrarian',
    bio: 'Investigative reporter. Reflexively probes the weakest seam in whichever argument the room currently favours.',
    traits: { skepticism: 0.9, empathy: 0.45, analytical: 0.8, emotionality: 0.3, authorityTrust: 0.15, independence: 0.95, suggestibility: 0.1 },
  },
  {
    name: 'Juror 6 — Salvu Bugeja',
    archetype: 'The Follower',
    bio: 'Warehouse supervisor in Ħal Far. Genuinely undecided most of the time and openly says he finds the last speaker convincing.',
    traits: { skepticism: 0.25, empathy: 0.55, analytical: 0.3, emotionality: 0.5, authorityTrust: 0.65, independence: 0.15, suggestibility: 0.9 },
  },
  {
    name: 'Juror 7 — Doris Zammit',
    archetype: 'The Statistician',
    bio: 'Actuary at an insurance firm in Sliema. Thinks in base rates and error bars, and will not call anything certain that is merely likely.',
    traits: { skepticism: 0.7, empathy: 0.35, analytical: 0.9, emotionality: 0.1, authorityTrust: 0.4, independence: 0.75, suggestibility: 0.2 },
  },
  {
    name: 'Juror 8 — Emanuel Grech',
    archetype: 'The Advocate',
    bio: 'Community organiser in Marsa. Anchors hard on reasonable doubt and argues the defence case even when outnumbered.',
    traits: { skepticism: 0.8, empathy: 0.8, analytical: 0.65, emotionality: 0.55, authorityTrust: 0.2, independence: 0.9, suggestibility: 0.15 },
  },
  {
    name: 'Juror 9 — Ċetta Portelli',
    archetype: 'The Traditionalist',
    bio: 'Retired postmistress from Nadur, Gozo. Defers to the judge\'s directions almost to the letter and is uneasy breaking from the group.',
    traits: { skepticism: 0.35, empathy: 0.6, analytical: 0.45, emotionality: 0.5, authorityTrust: 0.85, independence: 0.3, suggestibility: 0.65 },
  },
  {
    name: 'Juror 10 — Mario Spiteri',
    archetype: 'The Pragmatist',
    bio: 'Runs a family restaurant in Marsaxlokk. Impatient with theory, persuaded by whichever account best explains the everyday details.',
    traits: { skepticism: 0.5, empathy: 0.5, analytical: 0.55, emotionality: 0.4, authorityTrust: 0.45, independence: 0.55, suggestibility: 0.45 },
  },
  {
    name: 'Juror 11 — Roberta Falzon',
    archetype: 'The Idealist',
    bio: 'Philosophy postgraduate at the University of Malta. Deeply moved by questions of fairness and visibly troubled by ambiguity.',
    traits: { skepticism: 0.55, empathy: 0.85, analytical: 0.7, emotionality: 0.75, authorityTrust: 0.3, independence: 0.6, suggestibility: 0.5 },
  },
  {
    name: 'Juror 12 — Wistin Tabone',
    archetype: 'The Sceptic-at-Rest',
    bio: 'Night-shift security lead at the Freeport. Says little, changes his mind rarely, and only for something concrete.',
    traits: { skepticism: 0.85, empathy: 0.25, analytical: 0.6, emotionality: 0.2, authorityTrust: 0.55, independence: 0.85, suggestibility: 0.1 },
  },
];

export function buildJury(caseId: string): Juror[] {
  return ARCHETYPES.map((a, i) => ({
    id: randomUUID(),
    caseId,
    seat: i + 1,
    name: a.name,
    archetype: a.archetype,
    bio: a.bio,
    traits: { ...a.traits },
  }));
}

/**
 * How readily a juror absorbs new evidence, before the evidence's own
 * characteristics are taken into account.
 */
export function baseOpenness(t: JurorTraits): number {
  return 0.35 + 0.4 * t.analytical - 0.28 * t.skepticism;
}

/** How readily a juror is moved by peers during deliberation. */
export function susceptibility(t: JurorTraits, confidence: number): number {
  return Math.min(
    0.6,
    Math.max(0.01, 0.08 + 0.5 * t.suggestibility - 0.42 * t.independence - 0.18 * confidence),
  );
}

/**
 * A persistent personal tilt applied to whatever the agent concludes, so the
 * same evidence lands differently on different people. Without this, traits
 * only change how *fast* a juror moves toward a shared conclusion and all
 * twelve converge on the same number — leaving deliberation nothing to do.
 * Range is roughly ±0.25, i.e. a real disagreement but never a fixed verdict.
 */
export function dispositionBias(t: JurorTraits): number {
  const bias =
    -0.25 * (t.skepticism - 0.5) + // demanding proof favours acquittal
    0.22 * (t.authorityTrust - 0.5) + // crediting officials favours the state
    -0.12 * (t.empathy - 0.5) + // sympathy leans toward the defendant
    0.1 * (t.emotionality - 0.5);
  return Math.max(-0.35, Math.min(0.35, bias));
}

/** How much weight this juror's voice carries when arguing to others. */
export function persuasiveness(t: JurorTraits, confidence: number): number {
  return 0.25 + 0.45 * t.analytical + 0.2 * (1 - t.suggestibility) + 0.3 * confidence;
}
