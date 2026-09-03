import { createHash } from 'node:crypto';
import * as db from '../../store/db.js';
import { extractArticle, type ExtractedEntry } from './extract.js';
import { fetchEarlierEntries, sleep } from './feed.js';

export interface ScrapeOptions {
  /** Attach everything scraped to this case. */
  caseId?: string | null;
  /** Re-fetch URLs already stored with status "ok". */
  force?: boolean;
  /** Politeness delay between URLs and between feed pages. */
  delayMs?: number;
  userAgent?: string;
  timeoutMs?: number;
  maxFeedPages?: number;
  /** Skip the paged feed and keep only the server-rendered posts. */
  htmlOnly?: boolean;
  log?: (msg: string) => void;
}

export type ScrapeStatus = 'ok' | 'skipped' | 'failed';

export interface ScrapeResult {
  url: string;
  status: ScrapeStatus;
  title: string;
  entriesFound: number;
  entriesWritten: number;
  error?: string;
}

const DEFAULT_UA =
  'NOTaJuryBot/0.1 (research jury simulation; contact via repository owner)';

/** Stable ids so re-running never duplicates rows. */
function sourceId(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 24);
}
function entryId(srcId: string, externalId: string): string {
  return createHash('sha1').update(`${srcId}:${externalId}`).digest('hex').slice(0, 24);
}

async function fetchHtml(url: string, userAgent: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Newest-first everywhere, so `seq` is stable across re-runs. */
function orderEntries(entries: ExtractedEntry[]): ExtractedEntry[] {
  const byId = new Map<string, ExtractedEntry>();
  for (const e of entries) if (!byId.has(e.externalId)) byId.set(e.externalId, e);

  return [...byId.values()].sort((a, b) => {
    const an = Number(a.externalId);
    const bn = Number(b.externalId);
    if (Number.isFinite(an) && Number.isFinite(bn)) return bn - an;
    const at = a.postedAt?.getTime() ?? 0;
    const bt = b.postedAt?.getTime() ?? 0;
    return bt - at;
  });
}

export async function scrapeUrl(url: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const {
    caseId = null,
    force = false,
    delayMs = 1200,
    userAgent = DEFAULT_UA,
    timeoutMs = 30000,
    maxFeedPages = 60,
    htmlOnly = false,
    log = () => {},
  } = opts;

  const id = sourceId(url);

  // Already ingested? Leave it alone unless explicitly told otherwise.
  const existing = await db.getSourceByUrl(url);
  if (existing && existing.status === 'ok' && !force) {
    log(`  ↷ skip (already scraped ${existing.fetchedAt.slice(0, 10)}, ${existing.entryCount} entries)`);
    return {
      url,
      status: 'skipped',
      title: existing.title,
      entriesFound: existing.entryCount,
      entriesWritten: 0,
    };
  }

  try {
    const html = await fetchHtml(url, userAgent, timeoutMs);
    const article = extractArticle(html, url);
    let entries = article.entries;
    log(`  · ${entries.length} posts in HTML — "${article.title.slice(0, 62)}"`);

    // The article only server-renders the ten most recent posts; the rest come
    // from the same feed the "load more" button pages through.
    if (!htmlOnly && article.tenant && article.channelId && entries.length > 0) {
      const oldest = Math.min(
        ...entries.map((e) => Number(e.externalId)).filter((n) => Number.isFinite(n)),
      );
      if (Number.isFinite(oldest)) {
        const earlier = await fetchEarlierEntries({
          tenant: article.tenant,
          channelId: article.channelId,
          cursor: oldest,
          userAgent,
          delayMs,
          maxPages: maxFeedPages,
          timeoutMs,
        });
        if (earlier.length) log(`  · +${earlier.length} more from the live feed`);
        entries = entries.concat(earlier);
      }
    } else if (!htmlOnly && !article.channelId) {
      log('  · no live-blog feed on this page — using the rendered posts only');
    }

    const ordered = orderEntries(entries);

    await db.upsertSource({
      id,
      caseId,
      url,
      title: article.title,
      intro: article.intro,
      publisher: article.publisher,
      entryCount: ordered.length,
      status: 'ok',
      error: '',
    });

    const written = await db.upsertSourceEntries(
      id,
      ordered.map((e, i) => ({
        id: entryId(id, e.externalId),
        externalId: e.externalId,
        seq: i + 1,
        author: e.author,
        postedAtText: e.postedAtText,
        postedAt: e.postedAt,
        heading: e.heading,
        body: e.body,
        transcript: e.transcript,
      })),
    );

    const withTranscript = ordered.filter((e) => e.transcript.length > 0).length;
    log(`  ✓ ${ordered.length} entries stored (${withTranscript} look like transcripts)`);

    return {
      url,
      status: 'ok',
      title: article.title,
      entriesFound: ordered.length,
      entriesWritten: written,
    };
  } catch (err) {
    const message = (err as Error).message;
    log(`  ✗ ${message}`);
    await db.upsertSource({
      id,
      caseId,
      url,
      title: existing?.title ?? '',
      intro: existing?.intro ?? '',
      publisher: '',
      entryCount: existing?.entryCount ?? 0,
      status: 'failed',
      error: message,
    });
    return { url, status: 'failed', title: '', entriesFound: 0, entriesWritten: 0, error: message };
  }
}

export async function scrapeAll(urls: string[], opts: ScrapeOptions = {}): Promise<ScrapeResult[]> {
  const { delayMs = 1200, log = () => {} } = opts;
  const results: ScrapeResult[] = [];

  for (const [i, url] of urls.entries()) {
    log(`\n[${i + 1}/${urls.length}] ${url}`);
    results.push(await scrapeUrl(url, opts));
    if (i < urls.length - 1 && delayMs > 0) await sleep(delayMs);
  }

  return results;
}

/**
 * Accepts newline-, comma-, or semicolon-separated URLs. Blank lines and
 * `#` comments are ignored, and duplicates are collapsed.
 */
export function parseUrlList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const withoutComment = line.split('#')[0];
    for (const piece of withoutComment.split(/[,;\s]+/)) {
      const url = piece.trim();
      if (!url) continue;
      if (!/^https?:\/\//i.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }

  return out;
}
