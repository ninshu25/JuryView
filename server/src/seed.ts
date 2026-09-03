import { randomUUID } from 'node:crypto';
import { aggregate } from './sim/engine.js';
import { buildJury } from './sim/personalities.js';
import * as db from './store/db.js';
import type { JurorPosition } from './types.js';

/**
 * A fictional case so the UI has something to render on first run.
 * Entirely invented — no resemblance to any real proceeding.
 */
const DEMO = {
  title: 'The State v. Ambrose Thackeray-Nwosu',
  defendant: 'Ambrose Thackeray-Nwosu',
  charge: 'Aggravated arson of a commercial premises',
  summary:
    'A warehouse on Halloway Wharf burned down at 02:40 on a Tuesday. The defendant, a former ' +
    'employee dismissed six weeks earlier, was recorded on a traffic camera two streets away ' +
    'forty minutes before the fire. The prosecution alleges revenge arson; the defence says the ' +
    'defendant was walking home from a night shift at a different job and that the building had ' +
    'documented electrical faults. This is a FICTIONAL scenario used to demonstrate an AI simulation.',
};

export async function seedDemoCase(): Promise<void> {
  const existing = await db.listCases();
  if (existing.length > 0) return;

  const id = randomUUID();
  await db.createCase({
    id,
    title: DEMO.title,
    summary: DEMO.summary,
    defendant: DEMO.defendant,
    charge: DEMO.charge,
    realCase: false,
    sourceNote: '',
  });

  const jurors = buildJury(id);
  await db.insertJurors(jurors);

  const seeded: JurorPosition[] = jurors.map((j) => ({
    jurorId: j.id,
    round: 0,
    lean: 0,
    leaning: 'uncertain',
    confidence: 0.2,
    reasoning: 'No evidence has been presented yet. I begin from the presumption of innocence.',
    keyFactors: [],
    delta: 0,
    evidenceDelta: 0,
    peerDelta: 0,
  }));

  await db.insertPositions(id, seeded);
  await db.insertSnapshot(id, aggregate(seeded, 0, null));

  console.log(`[seed] created demo case "${DEMO.title}" (${id})`);
}

/** Suggested trial events, offered by the UI as one-click inputs. */
export const SUGGESTED_EVENTS = [
  {
    kind: 'evidence',
    side: 'prosecution',
    title: 'Traffic camera places defendant nearby',
    content:
      'A council traffic camera records the defendant on foot on Halloway Road at 02:01, two streets from the warehouse, forty minutes before the fire was reported.',
    strength: 0.6,
    emotional: 0.15,
    authority: 0.8,
  },
  {
    kind: 'testimony',
    side: 'prosecution',
    title: 'Former supervisor describes a threat',
    content:
      'The defendant\'s former supervisor testifies that after being dismissed the defendant said "that place will burn before I let them get away with this." Under cross-examination she concedes she did not report it at the time.',
    strength: 0.55,
    emotional: 0.75,
    authority: 0.3,
  },
  {
    kind: 'evidence',
    side: 'defence',
    title: 'Fire investigator: wiring fault plausible',
    content:
      'The fire investigator confirms the building had three logged electrical faults in the prior year and states the burn pattern is consistent with either an accelerant or a distribution-board failure. He will not exclude an accidental cause.',
    strength: 0.7,
    emotional: 0.1,
    authority: 0.9,
  },
  {
    kind: 'testimony',
    side: 'defence',
    title: 'Night-shift colleague confirms alibi window',
    content:
      'A colleague testifies the defendant clocked out of a warehouse job in Bexley at 01:20 and habitually walked the 50-minute route home, which passes Halloway Road.',
    strength: 0.5,
    emotional: 0.35,
    authority: 0.4,
  },
  {
    kind: 'cross_examination',
    side: 'defence',
    title: 'Accelerant trace evidence challenged',
    content:
      'The defence establishes that the accelerant swab was stored for eleven days in an unsealed evidence bag, contrary to the lab\'s own protocol. The analyst concedes contamination cannot be excluded.',
    strength: 0.75,
    emotional: 0.2,
    authority: 0.7,
  },
  {
    kind: 'evidence',
    side: 'prosecution',
    title: 'Search history recovered from phone',
    content:
      'Digital forensics recovers searches for "how long does a warehouse fire take to spread" made on the defendant\'s phone nine days before the fire. The defence notes the phone was shared with a flatmate.',
    strength: 0.65,
    emotional: 0.4,
    authority: 0.75,
  },
  {
    kind: 'cross_examination',
    side: 'prosecution',
    title: 'Cross-examination: the deleted messages',
    content:
      'Counsel presses the defendant on why no message history survives from before the phone was replaced.',
    strength: 0.7,
    emotional: 0.45,
    authority: 0.4,
    // Demonstrates transcript input — the reporter's asides are the unprefixed
    // lines. Fictional, matching the invented demo case.
    transcriptText: [
      'Counsel returns to a message thread recovered from a third party.',
      '',
      'Counsel: You told this court the phone was replaced on the Monday.',
      'Thackeray-Nwosu: That is right.',
      'Counsel: And yet there is no message history before that Monday at all.',
      'Thackeray-Nwosu: I did not keep a backup.',
      '',
      'The witness pauses and looks toward the public gallery.',
      '',
      'Counsel: Yesterday you recalled what you cooked that evening. Six years on, you recalled the lamb.',
      'Thackeray-Nwosu: I remember the meal.',
      'Counsel: But you do not remember whether you cleared the messages?',
      'Thackeray-Nwosu: I do not remember.',
      'Counsel: Would I be right that nothing survives from before the phone was replaced?',
      'Thackeray-Nwosu: I think there was no backup. I do not remember.',
    ].join('\n'),
  },
  {
    kind: 'instruction',
    side: 'neutral',
    title: 'Judge instructs on reasonable doubt',
    content:
      'The judge reminds the jury that the burden rests entirely with the prosecution, that the defendant need prove nothing, and that if any reasonable explanation consistent with innocence remains, they must acquit.',
    strength: 0.5,
    emotional: 0.25,
    authority: 0.95,
  },
  {
    kind: 'argument',
    side: 'prosecution',
    title: 'Closing: the pattern is the proof',
    content:
      'The prosecution argues that motive, threat, proximity and search history form a chain that no innocent explanation accounts for in combination.',
    strength: 0.45,
    emotional: 0.6,
    authority: 0.3,
  },
] as const;
