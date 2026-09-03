import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { activeProviderName } from '../ai/index.js';
import * as db from '../store/db.js';
import { aggregate, explainChange, runRound } from '../sim/engine.js';
import { buildJury } from '../sim/personalities.js';
import { parseTranscript } from '../sim/transcript.js';
import {
  DISCLAIMER,
  clamp,
  type CaseState,
  type EventKind,
  type JurorPosition,
  type Side,
  type TranscriptLine,
  type TrialEvent,
} from '../types.js';

export const casesRouter = Router();

const EVENT_KINDS: EventKind[] = [
  'evidence',
  'testimony',
  'argument',
  'instruction',
  'objection',
  'cross_examination',
];
const SIDES: Side[] = ['prosecution', 'defence', 'neutral'];

/* ------------------------------------------------------------------ list */

casesRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ cases: await db.listCases(), disclaimer: DISCLAIMER });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------------- create */

casesRouter.post('/', async (req, res, next) => {
  try {
    const { title, summary, defendant, charge } = req.body ?? {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }

    const id = randomUUID();
    const record = await db.createCase({
      id,
      title: title.slice(0, 200),
      summary: String(summary ?? '').slice(0, 5000),
      defendant: String(defendant ?? '').slice(0, 200),
      charge: String(charge ?? '').slice(0, 300),
      realCase: Boolean(req.body?.realCase),
      sourceNote: String(req.body?.sourceNote ?? '').slice(0, 500),
    });

    const jurors = buildJury(id);
    await db.insertJurors(jurors);

    // Round 0: everyone starts at the presumption of innocence, undecided.
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

    res.status(201).json({ case: record, jurors, disclaimer: DISCLAIMER });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------ full state */

casesRouter.get('/:id', async (req, res, next) => {
  try {
    const state = await loadState(req.params.id);
    if (!state) return res.status(404).json({ error: 'case not found' });
    res.json(state);
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------- feed an event + simulate */

casesRouter.post('/:id/events', async (req, res, next) => {
  try {
    const caseId = req.params.id;
    const record = await db.getCase(caseId);
    if (!record) return res.status(404).json({ error: 'case not found' });

    const body = req.body ?? {};
    if (!body.title || typeof body.title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }

    const kind: EventKind = EVENT_KINDS.includes(body.kind) ? body.kind : 'evidence';
    const side: Side = SIDES.includes(body.side) ? body.side : 'neutral';
    const round = record.round + 1;

    // Accept either a structured transcript or a pasted court-reporting block.
    const transcript: TranscriptLine[] = Array.isArray(body.transcript)
      ? body.transcript.slice(0, 400).map((l: any) => ({
          speaker: String(l?.speaker ?? '').slice(0, 80),
          role: String(l?.role ?? 'other') as TranscriptLine['role'],
          text: String(l?.text ?? '').slice(0, 2000),
        }))
      : typeof body.transcriptText === 'string' && body.transcriptText.trim()
        ? parseTranscript(body.transcriptText.slice(0, 20000), record.defendant)
        : [];

    const event: TrialEvent = {
      id: randomUUID(),
      caseId,
      round,
      kind,
      title: String(body.title).slice(0, 300),
      content: String(body.content ?? '').slice(0, 8000),
      side,
      strength: clamp(Number(body.strength ?? 0.5)),
      emotional: clamp(Number(body.emotional ?? 0.3)),
      authority: clamp(Number(body.authority ?? 0.3)),
      transcript,
      createdAt: new Date().toISOString(),
    };

    await db.insertEvent(event);
    const state = await simulate(caseId, event, round);
    res.status(201).json(state);
  } catch (err) {
    next(err);
  }
});

/* ------------------------- promote a scraped entry into a trial event */

casesRouter.post('/:id/events/from-entry/:entryId', async (req, res, next) => {
  try {
    const caseId = req.params.id;
    const record = await db.getCase(caseId);
    if (!record) return res.status(404).json({ error: 'case not found' });

    const entry = await db.getSourceEntry(req.params.entryId);
    if (!entry) return res.status(404).json({ error: 'source entry not found' });

    const body = req.body ?? {};
    const kind: EventKind = EVENT_KINDS.includes(body.kind)
      ? body.kind
      : (entry.transcript as unknown[]).length > 0
        ? 'testimony'
        : 'evidence';
    const side: Side = SIDES.includes(body.side) ? body.side : 'neutral';
    const round = record.round + 1;

    const event: TrialEvent = {
      id: randomUUID(),
      caseId,
      round,
      kind,
      title: (body.title ?? entry.heading ?? 'Untitled entry').slice(0, 300),
      content: String(body.content ?? entry.body ?? '').slice(0, 8000),
      side,
      strength: clamp(Number(body.strength ?? 0.5)),
      emotional: clamp(Number(body.emotional ?? 0.3)),
      authority: clamp(Number(body.authority ?? 0.3)),
      transcript: entry.transcript as TranscriptLine[],
      createdAt: new Date().toISOString(),
    };

    await db.insertEvent(event);
    await db.markEntryPromoted(entry.id, event.id);
    res.status(201).json(await simulate(caseId, event, round));
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------- extra deliberation, no new evidence */

casesRouter.post('/:id/deliberate', async (req, res, next) => {
  try {
    const caseId = req.params.id;
    const record = await db.getCase(caseId);
    if (!record) return res.status(404).json({ error: 'case not found' });

    const round = record.round + 1;
    const event: TrialEvent = {
      id: randomUUID(),
      caseId,
      round,
      kind: 'argument',
      title: 'Open deliberation',
      content:
        'The jury debates the evidence already presented. No new material is introduced; ' +
        'movement in this round comes from jurors arguing with each other.',
      side: 'neutral',
      strength: 0.12,
      emotional: 0.2,
      authority: 0.1,
      transcript: [],
      createdAt: new Date().toISOString(),
    };

    await db.insertEvent(event);
    const passes = Number(req.body?.passes ?? 3);
    const state = await simulate(caseId, event, round, clamp(passes, 1, 6));
    res.status(201).json(state);
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------------------- reset */

casesRouter.post('/:id/reset', async (req, res, next) => {
  try {
    const caseId = req.params.id;
    const record = await db.getCase(caseId);
    if (!record) return res.status(404).json({ error: 'case not found' });

    await db.resetCase(caseId);
    await db.clearPromotedForCase(caseId);
    const jurors = await db.getJurors(caseId);
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
    await db.insertPositions(caseId, seeded);
    await db.insertSnapshot(caseId, aggregate(seeded, 0, null));

    res.json(await loadState(caseId));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------- internals */

async function simulate(
  caseId: string,
  event: TrialEvent,
  round: number,
  passes?: number,
): Promise<CaseState> {
  const record = (await db.getCase(caseId))!;
  const jurors = await db.getJurors(caseId);
  const history = await db.getEvents(caseId);
  const allPositions = await db.getPositionHistory(caseId);
  const snapshots = await db.getSnapshots(caseId);

  const previousRound = Math.max(0, ...allPositions.map((p) => p.round));
  const previous = new Map(
    allPositions.filter((p) => p.round === previousRound).map((p) => [p.jurorId, p]),
  );

  const result = await runRound({
    caseSummary: record.summary,
    charge: record.charge,
    defendant: record.defendant,
    jurors,
    history: history.filter((e) => e.id !== event.id),
    event,
    previous,
    round,
    deliberationPasses: passes,
  });

  await db.insertPositions(caseId, result.positions);
  await db.insertSnapshot(caseId, result.snapshot);
  await db.insertInfluences(caseId, result.influences);
  await db.setCaseRound(caseId, round);

  const priorSnapshot = snapshots.find((s) => s.round === previousRound) ?? null;
  const lastChange = explainChange(
    jurors,
    event,
    result.positions,
    result.influences,
    result.snapshot,
    priorSnapshot,
  );

  return (await loadState(caseId, lastChange))!;
}

async function loadState(
  caseId: string,
  lastChange?: CaseState['lastChange'],
): Promise<CaseState | null> {
  const record = await db.getCase(caseId);
  if (!record) return null;

  const [jurors, events, history, snapshots, influences] = await Promise.all([
    db.getJurors(caseId),
    db.getEvents(caseId),
    db.getPositionHistory(caseId),
    db.getSnapshots(caseId),
    db.getInfluences(caseId),
  ]);

  const latestRound = Math.max(0, ...history.map((p) => p.round));
  const positions = history.filter((p) => p.round === latestRound);

  let change = lastChange ?? null;
  if (change === undefined || change === null) {
    // Rebuild the explanation for the most recent round on a cold page load.
    const snapshot = snapshots.find((s) => s.round === latestRound);
    if (snapshot && latestRound > 0) {
      const event = events.find((e) => e.round === latestRound) ?? null;
      const prior = snapshots.find((s) => s.round === latestRound - 1) ?? null;
      change = explainChange(
        jurors,
        event,
        positions,
        influences.filter((i) => i.round === latestRound),
        snapshot,
        prior,
      );
    }
  }

  return {
    case: record,
    jurors,
    positions,
    events,
    snapshots,
    history,
    influences,
    lastChange: change,
    aiProvider: activeProviderName(),
    disclaimer: DISCLAIMER,
  };
}
