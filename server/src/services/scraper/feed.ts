import { buildTranscript, htmlToBlockText, type ExtractedEntry } from './extract.js';

/**
 * Live Center (norkon) bulletin feed.
 *
 * Only the ten most recent posts are server-rendered into the article HTML;
 * the "load more" button pages backwards through this JSON endpoint. Walking
 * it directly gets the complete blog with no headless browser involved.
 *
 *   GET /BulletinFeed/{tenant}/{channelId}/EarlierObj/{oldestIdSoFar}/
 *   → { result: { bulletins: [...20], hasMore: bool } }
 */
const FEED_BASE = 'https://livecentercdn.norkon.net/BulletinFeed';

interface Bulletin {
  id: number;
  authorName?: string;
  created?: number;
  title?: string;
  content?: { html?: string };
}

export interface FeedOptions {
  tenant: string;
  channelId: string;
  /** Oldest post id already known — paging walks backwards from here. */
  cursor: number;
  userAgent: string;
  delayMs: number;
  maxPages: number;
  timeoutMs: number;
}

async function getJson(url: string, userAgent: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`feed ${res.status} for ${url}`);
    // The endpoint serves a UTF-8 BOM, which JSON.parse rejects.
    const text = (await res.text()).replace(/^﻿/, '');
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function toEntry(b: Bulletin): ExtractedEntry | null {
  const heading = (b.title ?? '').replace(/ /g, ' ').trim();
  const body = htmlToBlockText(b.content?.html ?? '');
  if (!heading && !body) return null;

  const postedAt = b.created ? new Date(b.created * 1000) : null;

  return {
    externalId: String(b.id),
    author: (b.authorName ?? '').trim(),
    postedAtText: postedAt ? postedAt.toISOString() : '',
    postedAt,
    heading,
    body,
    transcript: buildTranscript(body),
  };
}

/** Walks backwards until the feed says there is nothing older. */
export async function fetchEarlierEntries(opts: FeedOptions): Promise<ExtractedEntry[]> {
  const out: ExtractedEntry[] = [];
  let cursor = opts.cursor;

  for (let page = 0; page < opts.maxPages; page++) {
    const url = `${FEED_BASE}/${opts.tenant}/${opts.channelId}/EarlierObj/${cursor}/`;
    const json = await getJson(url, opts.userAgent, opts.timeoutMs);
    const result = json?.result ?? {};
    const bulletins: Bulletin[] = Array.isArray(result.bulletins) ? result.bulletins : [];
    if (bulletins.length === 0) break;

    for (const b of bulletins) {
      const entry = toEntry(b);
      if (entry) out.push(entry);
    }

    const oldest = Math.min(...bulletins.map((b) => b.id));
    if (!Number.isFinite(oldest) || oldest >= cursor) break; // no progress — stop
    cursor = oldest;

    if (!result.hasMore) break;
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }

  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
