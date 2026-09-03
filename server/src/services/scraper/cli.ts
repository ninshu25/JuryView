import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import * as db from '../../store/db.js';
import { parseUrlList, scrapeAll } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env') });
dotenv.config();

interface Args {
  file: string;
  caseId: string | null;
  force: boolean;
  htmlOnly: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    file: 'urls.txt',
    caseId: null,
    force: false,
    htmlOnly: false,
    delayMs: 1200,
  };

  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case') args.caseId = argv[++i] ?? null;
    else if (a === '--force') args.force = true;
    else if (a === '--html-only') args.htmlOnly = true;
    else if (a === '--delay') args.delayMs = Number(argv[++i] ?? 1200);
    else if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    } else rest.push(a);
  }

  if (rest[0]) args.file = rest[0];
  return args;
}

function usage() {
  console.log(`
NOTaJury scraper — pulls live-blog trial coverage into the database.

  npm run scrape --prefix server -- [urls.txt] [options]

  urls.txt        newline / comma separated URLs ("#" starts a comment)

  --case <id>     attach the scraped sources to this case
  --force         re-scrape URLs already stored as "ok"
  --html-only     keep only the server-rendered posts (skip the paged feed)
  --delay <ms>    politeness delay between requests (default 1200)

Scraping only populates the "sources" and "source_entries" tables. Nothing is
turned into a trial event — and no model is called — until you promote an entry
explicitly.
`);
}

/**
 * `npm run scrape --prefix server` runs with cwd set to server/, so a plain
 * `urls.txt` at the project root would not resolve. Try the obvious places.
 */
function readUrlFile(file: string): { raw: string; path: string } | null {
  const candidates = [
    resolve(process.cwd(), file),
    resolve(process.cwd(), '..', file),
    resolve(__dirname, '../../../..', file),
  ];
  for (const path of candidates) {
    try {
      return { raw: readFileSync(path, 'utf8'), path };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const found = readUrlFile(args.file);
  if (!found) {
    console.error(`Could not find a URL list named "${args.file}" (looked in the working directory, its parent, and the project root)`);
    usage();
    process.exit(1);
  }
  const { raw, path } = found;

  const urls = parseUrlList(raw);
  if (urls.length === 0) {
    console.error(`No http(s) URLs found in ${path}`);
    process.exit(1);
  }
  console.log(`URL list: ${path}`);

  await db.migrate();

  if (args.caseId) {
    const record = await db.getCase(args.caseId);
    if (!record) {
      console.error(`No case with id ${args.caseId}`);
      process.exit(1);
    }
    console.log(`Attaching to case: ${record.title}`);
  }

  console.log(`Scraping ${urls.length} URL(s)`);

  const results = await scrapeAll(urls, {
    caseId: args.caseId,
    force: args.force,
    htmlOnly: args.htmlOnly,
    delayMs: args.delayMs,
    log: (m) => console.log(m),
  });

  const ok = results.filter((r) => r.status === 'ok');
  const skipped = results.filter((r) => r.status === 'skipped');
  const failed = results.filter((r) => r.status === 'failed');
  const entries = ok.reduce((s, r) => s + r.entriesFound, 0);

  console.log(
    `\nDone — ${ok.length} scraped (${entries} entries), ${skipped.length} skipped, ${failed.length} failed.`,
  );
  for (const f of failed) console.log(`  failed: ${f.url} — ${f.error}`);
  if (skipped.length) console.log('  (re-run with --force to refresh skipped URLs)');

  await db.getPool().end();
}

main().catch((err) => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
