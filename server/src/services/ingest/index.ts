import { randomUUID } from 'node:crypto';
import { explainChange, runRound } from '../../sim/engine.js';
import * as db from '../../store/db.js';
import type { SourceEntryRow } from '../../store/db.js';
import { clamp, type EventKind, type Side, type TranscriptLine, type TrialEvent } from '../../types.js';

export interface IngestOptions {
  caseId: string;
  /** Only entries whose body was parsed as a court exchange. */
  transcriptsOnly?: boolean;
  /** Drop entries shorter than this — filters procedural chatter. */
  minChars?: number;
  /** Group this many consecutive entries into one simulation round. */
  batchSize?: number;
  /** Cap the number of rounds actually run. */
  maxRounds?: number;
  /** Select and report, but call no model and write no events. */
  dryRun?: boolean;
  side?: Side;
  strength?: number;
  emotional?: number;
  authority?: number;
  log?: (msg: string) => void;
}

/**
 * Live blogs carry a lot of housekeeping that is not evidence. Feeding these
 * to twelve agents costs twelve model calls to learn nothing.
 */
const NOISE = [
  /^good morning/i,
  /^good afternoon/i,
  /^live blog (over|has ended|starts)/i,
  /^that'?s (it|all)/i,
  /^welcome/i,
  /^we('| a)re (starting|about to|back)/i,
  /^(short |brief )?break/i,
  /^sitting (suspended|resumes)/i,
  /^court (breaks|resumes|adjourn)/i,
  /^trial adjourned/i,
  /^(recap|wrap|summary|what happened)/i,
  /^thank you for following/i,
  /^stay with us/i,
  /^refresh/i,
];

function isNoise(entry: SourceEntryRow): boolean {
  const h = entry.heading.trim();
  return NOISE.some((re) => re.test(h));
}

export interface SelectedBatch {
  entries: SourceEntryRow[];
  title: string;
  content: string;
  transcript: TranscriptLine[];
  kind: EventKind;
}

/** Chronological selection, filtered and grouped into prospective rounds. */
export async function selectBatches(opts: IngestOptions): Promise<{
  batches: SelectedBatch[];
  totalEntries: number;
  skippedNoise: number;
  skippedShort: number;
  skippedNoTranscript: number;
}> {
  const all = await db.listEntriesChronological({
    caseId: opts.caseId,
    onlyUnpromoted: true,
  });

  const minChars = opts.minChars ?? 220;
  let skippedNoise = 0;
  let skippedShort = 0;
  let skippedNoTranscript = 0;

  const kept: SourceEntryRow[] = [];
  for (const e of all) {
    const hasTranscript = (e.transcript as unknown[]).length > 0;
    if (isNoise(e)) {
      skippedNoise++;
      continue;
    }
    if (opts.transcriptsOnly && !hasTranscript) {
      skippedNoTranscript++;
      continue;
    }
    // A transcript is meaningful even when short; prose needs some substance.
    if (!hasTranscript && e.body.trim().length < minChars) {
      skippedShort++;
      continue;
    }
    kept.push(e);
  }

  const size = Math.max(1, opts.batchSize ?? 1);
  const batches: SelectedBatch[] = [];

  for (let i = 0; i < kept.length; i += size) {
    const group = kept.slice(i, i + size);
    const transcript = group.flatMap((g) => g.transcript as TranscriptLine[]);

    const content = group
      .map((g) => {
        const time = g.postedAt ? new Date(g.postedAt).toISOString().slice(11, 16) : '';
        const head = g.heading ? `${time ? time + ' — ' : ''}${g.heading}` : time;
        return head ? `${head}\n${g.body}` : g.body;
      })
      .join('\n\n');

    const title =
      group.length === 1
        ? group[0].heading || 'Trial entry'
        : `${group[0].heading || 'Trial entries'} (+${group.length - 1} more)`;

    batches.push({
      entries: group,
      title,
      content,
      transcript,
      kind: transcript.length > 0 ? 'testimony' : 'evidence',
    });
  }

  const limited =
    opts.maxRounds && opts.maxRounds > 0 ? batches.slice(0, opts.maxRounds) : batches;

  return {
    batches: limited,
    totalEntries: all.length,
    skippedNoise,
    skippedShort,
    skippedNoTranscript,
  };
}

export interface IngestResult {
  roundsRun: number;
  entriesUsed: number;
  finalLean: number | null;
}

/** Runs the simulation over the selected batches, one round each. */
export async function ingest(opts: IngestOptions): Promise<IngestResult> {
  const log = opts.log ?? (() => {});
  const selection = await selectBatches(opts);
  const { batches } = selection;

  log(
    `Selected ${batches.length} round(s) from ${selection.totalEntries} entries ` +
      `(skipped ${selection.skippedNoise} procedural, ${selection.skippedShort} too short` +
      (opts.transcriptsOnly ? `, ${selection.skippedNoTranscript} without transcript` : '') +
      ')',
  );

  if (opts.dryRun) {
    log('\nDry run — no model calls, nothing written. First 10 rounds:');
    batches.slice(0, 10).forEach((b, i) => {
      const tr = b.transcript.length ? ` · ${b.transcript.length} transcript lines` : '';
      log(`  ${String(i + 1).padStart(3)}. ${b.title.slice(0, 74)}${tr}`);
    });
    if (batches.length > 10) log(`  … and ${batches.length - 10} more`);
    return { roundsRun: 0, entriesUsed: 0, finalLean: null };
  }

  const record = await db.getCase(opts.caseId);
  if (!record) throw new Error(`no case with id ${opts.caseId}`);

  const jurors = await db.getJurors(opts.caseId);
  let round = record.round;
  let entriesUsed = 0;
  let finalLean: number | null = null;

  for (const [i, batch] of batches.entries()) {
    round += 1;

    const event: TrialEvent = {
      id: randomUUID(),
      caseId: opts.caseId,
      round,
      kind: batch.kind,
      title: batch.title.slice(0, 300),
      content: batch.content.slice(0, 8000),
      side: opts.side ?? 'neutral',
      strength: clamp(opts.strength ?? 0.5),
      emotional: clamp(opts.emotional ?? 0.35),
      authority: clamp(opts.authority ?? 0.4),
      transcript: batch.transcript,
      createdAt: new Date().toISOString(),
    };

    await db.insertEvent(event);

    const history = await db.getEvents(opts.caseId);
    const allPositions = await db.getPositionHistory(opts.caseId);
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
    });

    await db.insertPositions(opts.caseId, result.positions);
    await db.insertSnapshot(opts.caseId, result.snapshot);
    await db.insertInfluences(opts.caseId, result.influences);
    await db.setCaseRound(opts.caseId, round);

    for (const e of batch.entries) await db.markEntryPromoted(e.id, event.id);
    entriesUsed += batch.entries.length;
    finalLean = result.snapshot.juryLean;

    const s = result.snapshot;
    log(
      `  [${i + 1}/${batches.length}] r${round} lean ${s.juryLean >= 0 ? '+' : ''}${s.juryLean.toFixed(2)} ` +
        `G${Math.round(s.guiltyPct)} NG${Math.round(s.notGuiltyPct)} U${Math.round(s.uncertainPct)} · ${batch.title.slice(0, 52)}`,
    );

    // Keep the attribution fresh for the UI's "why did it change" panel.
    const snapshots = await db.getSnapshots(opts.caseId);
    explainChange(
      jurors,
      event,
      result.positions,
      result.influences,
      result.snapshot,
      snapshots.find((s2) => s2.round === round - 1) ?? null,
    );
  }

  return { roundsRun: batches.length, entriesUsed, finalLean };
}
