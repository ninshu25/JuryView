import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type {
  CaseRecord,
  InfluenceEdge,
  Juror,
  JurorPosition,
  JurySnapshot,
  TrialEvent,
} from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Postgres hands REAL/NUMERIC back as strings by default; we want numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, parseFloat);

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set — copy .env.example to .env');
    }
    pool = new pg.Pool({
      connectionString,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return pool;
}

export async function migrate(): Promise<void> {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await getPool().query(sql);
}

async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/* ------------------------------------------------------------------ cases */

export async function createCase(c: Omit<CaseRecord, 'createdAt' | 'round'>): Promise<CaseRecord> {
  const rows = await query<any>(
    `INSERT INTO cases (id, title, summary, defendant, charge, round, real_case, source_note)
     VALUES ($1, $2, $3, $4, $5, 0, $6, $7) RETURNING *`,
    [c.id, c.title, c.summary, c.defendant, c.charge, c.realCase, c.sourceNote],
  );
  return mapCase(rows[0]);
}

export async function listCases(): Promise<CaseRecord[]> {
  const rows = await query<any>(`SELECT * FROM cases ORDER BY created_at DESC`);
  return rows.map(mapCase);
}

export async function getCase(id: string): Promise<CaseRecord | null> {
  const rows = await query<any>(`SELECT * FROM cases WHERE id = $1`, [id]);
  return rows[0] ? mapCase(rows[0]) : null;
}

export async function setCaseRound(id: string, round: number): Promise<void> {
  await query(`UPDATE cases SET round = $2 WHERE id = $1`, [id, round]);
}

function mapCase(r: any): CaseRecord {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    defendant: r.defendant,
    charge: r.charge,
    round: Number(r.round),
    realCase: Boolean(r.real_case),
    sourceNote: r.source_note ?? '',
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/* ----------------------------------------------------------------- jurors */

export async function insertJurors(jurors: Juror[]): Promise<void> {
  for (const j of jurors) {
    await query(
      `INSERT INTO jurors (id, case_id, seat, name, archetype, bio, traits)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [j.id, j.caseId, j.seat, j.name, j.archetype, j.bio, JSON.stringify(j.traits)],
    );
  }
}

export async function getJurors(caseId: string): Promise<Juror[]> {
  const rows = await query<any>(`SELECT * FROM jurors WHERE case_id = $1 ORDER BY seat`, [caseId]);
  return rows.map((r) => ({
    id: r.id,
    caseId: r.case_id,
    seat: Number(r.seat),
    name: r.name,
    archetype: r.archetype,
    bio: r.bio,
    traits: typeof r.traits === 'string' ? JSON.parse(r.traits) : r.traits,
  }));
}

/* ----------------------------------------------------------------- events */

export async function insertEvent(e: TrialEvent): Promise<TrialEvent> {
  const rows = await query<any>(
    `INSERT INTO events (id, case_id, round, kind, title, content, side, strength, emotional, authority, transcript)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      e.id, e.caseId, e.round, e.kind, e.title, e.content, e.side,
      e.strength, e.emotional, e.authority, JSON.stringify(e.transcript ?? []),
    ],
  );
  return mapEvent(rows[0]);
}

export async function getEvents(caseId: string): Promise<TrialEvent[]> {
  const rows = await query<any>(
    `SELECT * FROM events WHERE case_id = $1 ORDER BY round, created_at`,
    [caseId],
  );
  return rows.map(mapEvent);
}

function mapEvent(r: any): TrialEvent {
  return {
    id: r.id,
    caseId: r.case_id,
    round: Number(r.round),
    kind: r.kind,
    title: r.title,
    content: r.content,
    side: r.side,
    strength: Number(r.strength),
    emotional: Number(r.emotional),
    authority: Number(r.authority),
    transcript:
      typeof r.transcript === 'string' ? JSON.parse(r.transcript) : (r.transcript ?? []),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/* -------------------------------------------------------------- positions */

export async function insertPositions(caseId: string, positions: JurorPosition[]): Promise<void> {
  for (const p of positions) {
    await query(
      `INSERT INTO juror_positions
         (case_id, juror_id, round, lean, leaning, confidence, reasoning, key_factors, delta, evidence_delta, peer_delta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (juror_id, round) DO UPDATE SET
         lean = EXCLUDED.lean, leaning = EXCLUDED.leaning, confidence = EXCLUDED.confidence,
         reasoning = EXCLUDED.reasoning, key_factors = EXCLUDED.key_factors, delta = EXCLUDED.delta,
         evidence_delta = EXCLUDED.evidence_delta, peer_delta = EXCLUDED.peer_delta`,
      [
        caseId, p.jurorId, p.round, p.lean, p.leaning, p.confidence,
        p.reasoning, JSON.stringify(p.keyFactors), p.delta, p.evidenceDelta, p.peerDelta,
      ],
    );
  }
}

export async function getPositionHistory(caseId: string): Promise<JurorPosition[]> {
  const rows = await query<any>(
    `SELECT * FROM juror_positions WHERE case_id = $1 ORDER BY round, juror_id`,
    [caseId],
  );
  return rows.map(mapPosition);
}

function mapPosition(r: any): JurorPosition {
  return {
    jurorId: r.juror_id,
    round: Number(r.round),
    lean: Number(r.lean),
    leaning: r.leaning,
    confidence: Number(r.confidence),
    reasoning: r.reasoning,
    keyFactors: typeof r.key_factors === 'string' ? JSON.parse(r.key_factors) : r.key_factors ?? [],
    delta: Number(r.delta),
    evidenceDelta: Number(r.evidence_delta),
    peerDelta: Number(r.peer_delta),
  };
}

/* -------------------------------------------------------------- snapshots */

export async function insertSnapshot(caseId: string, s: JurySnapshot): Promise<void> {
  await query(
    `INSERT INTO jury_snapshots
       (case_id, round, event_id, jury_lean, guilty_pct, not_guilty_pct, uncertain_pct, consensus, confidence, unanimous)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (case_id, round) DO UPDATE SET
       event_id = EXCLUDED.event_id, jury_lean = EXCLUDED.jury_lean, guilty_pct = EXCLUDED.guilty_pct,
       not_guilty_pct = EXCLUDED.not_guilty_pct, uncertain_pct = EXCLUDED.uncertain_pct,
       consensus = EXCLUDED.consensus, confidence = EXCLUDED.confidence, unanimous = EXCLUDED.unanimous`,
    [
      caseId, s.round, s.eventId, s.juryLean, s.guiltyPct, s.notGuiltyPct,
      s.uncertainPct, s.consensus, s.confidence, s.unanimous,
    ],
  );
}

export async function getSnapshots(caseId: string): Promise<JurySnapshot[]> {
  const rows = await query<any>(
    `SELECT * FROM jury_snapshots WHERE case_id = $1 ORDER BY round`,
    [caseId],
  );
  return rows.map((r) => ({
    round: Number(r.round),
    eventId: r.event_id,
    juryLean: Number(r.jury_lean),
    guiltyPct: Number(r.guilty_pct),
    notGuiltyPct: Number(r.not_guilty_pct),
    uncertainPct: Number(r.uncertain_pct),
    consensus: Number(r.consensus),
    confidence: Number(r.confidence),
    unanimous: Boolean(r.unanimous),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/* ------------------------------------------------------------- influences */

export async function insertInfluences(caseId: string, edges: InfluenceEdge[]): Promise<void> {
  for (const e of edges) {
    await query(
      `INSERT INTO influences (case_id, round, from_juror_id, to_juror_id, magnitude)
       VALUES ($1,$2,$3,$4,$5)`,
      [caseId, e.round, e.fromJurorId, e.toJurorId, e.magnitude],
    );
  }
}

export async function getInfluences(caseId: string): Promise<InfluenceEdge[]> {
  const rows = await query<any>(
    `SELECT * FROM influences WHERE case_id = $1 ORDER BY round`,
    [caseId],
  );
  return rows.map((r) => ({
    round: Number(r.round),
    fromJurorId: r.from_juror_id,
    toJurorId: r.to_juror_id,
    magnitude: Number(r.magnitude),
  }));
}

/* ------------------------------------------------------------------ reset */

export async function resetCase(caseId: string): Promise<void> {
  await query(`DELETE FROM influences WHERE case_id = $1`, [caseId]);
  await query(`DELETE FROM jury_snapshots WHERE case_id = $1`, [caseId]);
  await query(`DELETE FROM juror_positions WHERE case_id = $1`, [caseId]);
  await query(`DELETE FROM events WHERE case_id = $1`, [caseId]);
  await query(`UPDATE cases SET round = 0 WHERE id = $1`, [caseId]);
}

/* ---------------------------------------------------------------- sources */

export interface SourceRow {
  id: string;
  caseId: string | null;
  url: string;
  title: string;
  intro: string;
  publisher: string;
  entryCount: number;
  status: string;
  error: string;
  fetchedAt: string;
}

export interface SourceEntryRow {
  id: string;
  sourceId: string;
  externalId: string;
  seq: number;
  author: string;
  postedAtText: string;
  postedAt: string | null;
  heading: string;
  body: string;
  transcript: unknown[];
  promotedEventId: string | null;
}

/** Lets the scraper skip URLs it has already ingested. */
export async function getSourceByUrl(url: string): Promise<SourceRow | null> {
  const rows = await query<any>(`SELECT * FROM sources WHERE url = $1`, [url]);
  return rows[0] ? mapSource(rows[0]) : null;
}

export async function listSources(caseId?: string): Promise<SourceRow[]> {
  const rows = caseId
    ? await query<any>(`SELECT * FROM sources WHERE case_id = $1 ORDER BY fetched_at DESC`, [caseId])
    : await query<any>(`SELECT * FROM sources ORDER BY fetched_at DESC`);
  return rows.map(mapSource);
}

export async function upsertSource(s: {
  id: string;
  caseId: string | null;
  url: string;
  title: string;
  intro: string;
  publisher: string;
  entryCount: number;
  status: string;
  error: string;
}): Promise<SourceRow> {
  const rows = await query<any>(
    `INSERT INTO sources (id, case_id, url, title, intro, publisher, entry_count, status, error, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (url) DO UPDATE SET
       case_id = EXCLUDED.case_id, title = EXCLUDED.title, intro = EXCLUDED.intro,
       publisher = EXCLUDED.publisher, entry_count = EXCLUDED.entry_count,
       status = EXCLUDED.status, error = EXCLUDED.error, fetched_at = now()
     RETURNING *`,
    [s.id, s.caseId, s.url, s.title, s.intro, s.publisher, s.entryCount, s.status, s.error],
  );
  return mapSource(rows[0]);
}

/** Idempotent per (source, external post id) — re-running only adds new posts. */
export async function upsertSourceEntries(
  sourceId: string,
  entries: Array<{
    id: string;
    externalId: string;
    seq: number;
    author: string;
    postedAtText: string;
    postedAt: Date | null;
    heading: string;
    body: string;
    transcript: unknown[];
  }>,
): Promise<number> {
  let written = 0;
  for (const e of entries) {
    const res = await getPool().query(
      `INSERT INTO source_entries
         (id, source_id, external_id, seq, author, posted_at_text, posted_at, heading, body, transcript)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (source_id, external_id) DO UPDATE SET
         seq = EXCLUDED.seq, author = EXCLUDED.author,
         posted_at_text = EXCLUDED.posted_at_text, posted_at = EXCLUDED.posted_at,
         heading = EXCLUDED.heading, body = EXCLUDED.body, transcript = EXCLUDED.transcript`,
      [
        e.id, sourceId, e.externalId, e.seq, e.author, e.postedAtText,
        e.postedAt, e.heading, e.body, JSON.stringify(e.transcript ?? []),
      ],
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

export async function listSourceEntries(sourceId: string): Promise<SourceEntryRow[]> {
  const rows = await query<any>(
    `SELECT * FROM source_entries WHERE source_id = $1 ORDER BY seq`,
    [sourceId],
  );
  return rows.map(mapSourceEntry);
}

export async function getSourceEntry(entryId: string): Promise<SourceEntryRow | null> {
  const rows = await query<any>(`SELECT * FROM source_entries WHERE id = $1`, [entryId]);
  return rows[0] ? mapSourceEntry(rows[0]) : null;
}

export async function markEntryPromoted(entryId: string, eventId: string): Promise<void> {
  await query(`UPDATE source_entries SET promoted_event_id = $2 WHERE id = $1`, [entryId, eventId]);
}

function mapSource(r: any): SourceRow {
  return {
    id: r.id,
    caseId: r.case_id,
    url: r.url,
    title: r.title,
    intro: r.intro,
    publisher: r.publisher,
    entryCount: Number(r.entry_count),
    status: r.status,
    error: r.error ?? '',
    fetchedAt: new Date(r.fetched_at).toISOString(),
  };
}

function mapSourceEntry(r: any): SourceEntryRow {
  return {
    id: r.id,
    sourceId: r.source_id,
    externalId: r.external_id,
    seq: Number(r.seq),
    author: r.author,
    postedAtText: r.posted_at_text,
    postedAt: r.posted_at ? new Date(r.posted_at).toISOString() : null,
    heading: r.heading,
    body: r.body,
    transcript: typeof r.transcript === 'string' ? JSON.parse(r.transcript) : (r.transcript ?? []),
    promotedEventId: r.promoted_event_id,
  };
}

/** Attach scraped sources to a case after the fact. */
export async function linkSourcesToCase(caseId: string, sourceIds?: string[]): Promise<number> {
  const res = sourceIds?.length
    ? await getPool().query(`UPDATE sources SET case_id = $1 WHERE id = ANY($2)`, [caseId, sourceIds])
    : await getPool().query(`UPDATE sources SET case_id = $1 WHERE case_id IS NULL`, [caseId]);
  return res.rowCount ?? 0;
}

/**
 * Every scraped entry in true trial order (oldest first). `seq` within a source
 * is newest-first, so chronology has to come from posted_at.
 */
export async function listEntriesChronological(opts: {
  caseId?: string | null;
  onlyUnpromoted?: boolean;
} = {}): Promise<Array<SourceEntryRow & { sourceTitle: string }>> {
  const rows = await query<any>(
    `SELECT se.*, s.title AS source_title
       FROM source_entries se
       JOIN sources s ON s.id = se.source_id
      WHERE ($1::text IS NULL OR s.case_id = $1)
        AND ($2::boolean IS NOT TRUE OR se.promoted_event_id IS NULL)
      ORDER BY se.posted_at NULLS LAST, se.seq DESC`,
    [opts.caseId ?? null, opts.onlyUnpromoted ?? false],
  );
  return rows.map((r) => ({ ...mapSourceEntry(r), sourceTitle: r.source_title }));
}

/**
 * Resetting a trial deletes its events, so entries pointing at them must be
 * un-marked or a re-ingest would skip everything as "already promoted".
 */
export async function clearPromotedForCase(caseId: string): Promise<number> {
  const res = await getPool().query(
    `UPDATE source_entries se SET promoted_event_id = NULL
       FROM sources s
      WHERE s.id = se.source_id AND s.case_id = $1 AND se.promoted_event_id IS NOT NULL`,
    [caseId],
  );
  return res.rowCount ?? 0;
}

/* ----------------------------------------------------------------- portal */

export async function deleteCase(caseId: string): Promise<void> {
  await query(`DELETE FROM cases WHERE id = $1`, [caseId]);
}

export async function updateCaseMeta(
  caseId: string,
  patch: { title?: string; summary?: string; defendant?: string; charge?: string; realCase?: boolean; sourceNote?: string },
): Promise<CaseRecord | null> {
  const rows = await query<any>(
    `UPDATE cases SET
       title       = COALESCE($2, title),
       summary     = COALESCE($3, summary),
       defendant   = COALESCE($4, defendant),
       charge      = COALESCE($5, charge),
       real_case   = COALESCE($6, real_case),
       source_note = COALESCE($7, source_note)
     WHERE id = $1 RETURNING *`,
    [
      caseId, patch.title ?? null, patch.summary ?? null, patch.defendant ?? null,
      patch.charge ?? null, patch.realCase ?? null, patch.sourceNote ?? null,
    ],
  );
  return rows[0] ? mapCase(rows[0]) : null;
}

export async function updateJuror(
  jurorId: string,
  patch: { name?: string; archetype?: string; bio?: string; traits?: unknown },
): Promise<Juror | null> {
  const rows = await query<any>(
    `UPDATE jurors SET
       name      = COALESCE($2, name),
       archetype = COALESCE($3, archetype),
       bio       = COALESCE($4, bio),
       traits    = COALESCE($5::jsonb, traits)
     WHERE id = $1 RETURNING *`,
    [
      jurorId, patch.name ?? null, patch.archetype ?? null, patch.bio ?? null,
      patch.traits ? JSON.stringify(patch.traits) : null,
    ],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id, caseId: r.case_id, seat: Number(r.seat), name: r.name,
    archetype: r.archetype, bio: r.bio,
    traits: typeof r.traits === 'string' ? JSON.parse(r.traits) : r.traits,
  };
}

/** Counts for the portal overview, in one round trip per case. */
export async function caseStats(caseId: string): Promise<{
  events: number; entries: number; promoted: number; sources: number;
}> {
  const rows = await query<any>(
    `SELECT
       (SELECT count(*) FROM events WHERE case_id = $1) AS events,
       (SELECT count(*) FROM sources WHERE case_id = $1) AS sources,
       (SELECT count(*) FROM source_entries se JOIN sources s ON s.id = se.source_id
         WHERE s.case_id = $1) AS entries,
       (SELECT count(*) FROM source_entries se JOIN sources s ON s.id = se.source_id
         WHERE s.case_id = $1 AND se.promoted_event_id IS NOT NULL) AS promoted`,
    [caseId],
  );
  const r = rows[0] ?? {};
  return {
    events: Number(r.events ?? 0),
    entries: Number(r.entries ?? 0),
    promoted: Number(r.promoted ?? 0),
    sources: Number(r.sources ?? 0),
  };
}
