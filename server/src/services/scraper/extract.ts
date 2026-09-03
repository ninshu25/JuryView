import * as cheerio from 'cheerio';
import { parseTranscript } from '../../sim/transcript.js';
import type { TranscriptLine } from '../../types.js';

export interface ExtractedEntry {
  externalId: string;
  author: string;
  postedAtText: string;
  postedAt: Date | null;
  heading: string;
  body: string;
  transcript: TranscriptLine[];
}

export interface ExtractedArticle {
  title: string;
  intro: string;
  publisher: string;
  /** Live Center tenant + channel, when the page embeds a live blog. */
  tenant: string | null;
  channelId: string | null;
  entries: ExtractedEntry[];
}

/**
 * The live blog lives in `<div id="master-container">` on Times of Malta.
 * A class of the same name is accepted too, so a sibling site using the same
 * markup still parses.
 */
const CONTAINER = '#master-container, .master-container';

/** The page embeds its feed coordinates as `setJsonContent('tenant', 90611)`. */
const CHANNEL_RE = /setJsonContent\(\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*\)/;

function clean(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Paragraph-preserving text. Each block becomes its own line, which is what
 * makes `Speaker: words` transcript detection possible downstream — a single
 * flattened blob would lose the turn boundaries.
 */
export function blockText($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string {
  if (!el || el.length === 0) return '';
  const parts: string[] = [];
  el.find('p, li, h2, h3, h4, blockquote').each((_, node) => {
    const t = clean($(node).text());
    if (t) parts.push(t);
  });
  return parts.length ? parts.join('\n') : clean(el.text());
}

/** Turns a fragment of feed HTML into the same paragraph-per-line form. */
export function htmlToBlockText(html: string): string {
  const $ = cheerio.load(`<div id="__wrap">${html || ''}</div>`);
  return blockText($, $('#__wrap'));
}

/** "August 4, 2026 - 4:03 PM" → Date, best effort. */
export function parseTimestamp(raw: string): Date | null {
  const cleaned = clean(raw).replace(/\s+-\s+/, ' ');
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A post counts as a transcript only when several of its lines look like
 * `Speaker: words`. Live-blog prose regularly contains a colon, so one match
 * is not enough to call the whole post an exchange.
 */
export function looksLikeTranscript(body: string): boolean {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const dialogue = lines.filter((l) => /^[^:]{1,48}:\s*\S/.test(l)).length;
  return dialogue >= 2 && dialogue / lines.length >= 0.4;
}

export function buildTranscript(body: string): TranscriptLine[] {
  return looksLikeTranscript(body) ? parseTranscript(body) : [];
}

export function extractArticle(html: string, url: string): ExtractedArticle {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    clean($('h1').first().text()) ||
    url;

  const publisher =
    $('meta[property="og:site_name"]').attr('content')?.trim() ||
    new URL(url).hostname.replace(/^www\./, '');

  const container = $(CONTAINER).first();
  const scope = container.length ? container : $('body');

  const intro = blockText($, scope.find('.ncpost-top-text-container').first());

  const channelMatch = html.match(CHANNEL_RE);

  const entries: ExtractedEntry[] = [];
  scope.find('.ncpost-list-post').each((i, node) => {
    const post = $(node);
    const externalId =
      post.find('.ncpost-container').first().attr('data-ncpost-id') ||
      post.attr('aria-labelledby')?.replace('ncpost-list-post-title-', '') ||
      String(i + 1);

    const heading = clean(post.find('.ncpost-title').first().text());
    const body = blockText($, post.find('.ncpost-content').first());
    if (!heading && !body) return;

    const postedAtText = clean(post.find('.ncpost-timestamp').first().text());

    entries.push({
      externalId,
      author: clean(post.find('.ncpost-byline').first().text()),
      postedAtText,
      postedAt: parseTimestamp(postedAtText),
      heading,
      body,
      transcript: buildTranscript(body),
    });
  });

  return {
    title,
    intro,
    publisher,
    tenant: channelMatch?.[1] ?? null,
    channelId: channelMatch?.[2] ?? null,
    entries,
  };
}
