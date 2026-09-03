import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { activeProviderName, providerStats, resetProviderStats } from '../../ai/index.js';
import { aggregate } from '../../sim/engine.js';
import { buildJury } from '../../sim/personalities.js';
import * as db from '../../store/db.js';
import type { JurorPosition, Side } from '../../types.js';
import { ingest, selectBatches } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../../.env') });
dotenv.config();

function usage() {
  console.log(`
NOTaJury ingest — runs the simulation over scraped live-blog entries.

  npm run ingest --prefix server -- [options]

  --case <id>          case to run against (required unless --create-case)
  --create-case        create a case from flags below, link all unlinked sources
    --title <s> --defendant <s> --charge <s> --summary <s> --source-note <s>

  --dry-run            show what would run; no model calls, nothing written
  --transcripts-only   only entries parsed as court exchanges
  --min-chars <n>      drop prose shorter than this (default 220)
  --batch <n>          group n consecutive entries into one round (default 1)
  --max-rounds <n>     stop after n rounds
  --side <s>           prosecution | defence | neutral (default neutral)
  --strength <0-1>  --emotional <0-1>  --authority <0-1>
  --yes                skip the confirmation prompt

Each round costs 12 model calls — one per juror. Start with --dry-run.
`);
}

interface Args {
  caseId: string | null;
  createCase: boolean;
  title: string;
  defendant: string;
  charge: string;
  summary: string;
  sourceNote: string;
  dryRun: boolean;
  transcriptsOnly: boolean;
  minChars: number;
  batch: number;
  maxRounds: number;
  side: Side;
  strength: number;
  emotional: number;
  authority: number;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    caseId: null, createCase: false,
    title: '', defendant: '', charge: '', summary: '', sourceNote: '',
    dryRun: false, transcriptsOnly: false, minChars: 220, batch: 1, maxRounds: 0,
    side: 'neutral', strength: 0.5, emotional: 0.35, authority: 0.4, yes: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i] ?? '';
    if (k === '--case') a.caseId = next();
    else if (k === '--create-case') a.createCase = true;
    else if (k === '--title') a.title = next();
    else if (k === '--defendant') a.defendant = next();
    else if (k === '--charge') a.charge = next();
    else if (k === '--summary') a.summary = next();
    else if (k === '--source-note') a.sourceNote = next();
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--transcripts-only') a.transcriptsOnly = true;
    else if (k === '--min-chars') a.minChars = Number(next());
    else if (k === '--batch') a.batch = Number(next());
    else if (k === '--max-rounds') a.maxRounds = Number(next());
    else if (k === '--side') a.side = next() as Side;
    else if (k === '--strength') a.strength = Number(next());
    else if (k === '--emotional') a.emotional = Number(next());
    else if (k === '--authority') a.authority = Number(next());
    else if (k === '--yes' || k === '-y') a.yes = true;
    else if (k === '--help' || k === '-h') { usage(); process.exit(0); }
  }
  return a;
}

async function confirm(question: string): Promise<boolean> {
  process.stdout.write(question);
  return new Promise((res) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (d) => {
      process.stdin.pause();
      res(/^y(es)?$/i.test(String(d).trim()));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await db.migrate();

  let caseId = args.caseId;

  if (args.createCase) {
    if (!args.title) {
      console.error('--create-case needs at least --title');
      process.exit(1);
    }
    const id = randomUUID();
    await db.createCase({
      id,
      title: args.title,
      summary: args.summary,
      defendant: args.defendant,
      charge: args.charge,
      // Anything scraped from live coverage is a real proceeding by definition.
      realCase: true,
      sourceNote: args.sourceNote,
    });
    const jurors = buildJury(id);
    await db.insertJurors(jurors);
    const seeded: JurorPosition[] = jurors.map((j) => ({
      jurorId: j.id, round: 0, lean: 0, leaning: 'uncertain', confidence: 0.2,
      reasoning: 'No evidence has been presented yet. I begin from the presumption of innocence.',
      keyFactors: [], delta: 0, evidenceDelta: 0, peerDelta: 0,
    }));
    await db.insertPositions(id, seeded);
    await db.insertSnapshot(id, aggregate(seeded, 0, null));

    const linked = await db.linkSourcesToCase(id);
    console.log(`Created case ${id}`);
    console.log(`  "${args.title}" — flagged as a real proceeding`);
    console.log(`  linked ${linked} previously unlinked source(s)\n`);
    caseId = id;
  }

  if (!caseId) {
    console.error('Pass --case <id>, or --create-case to make one.');
    usage();
    process.exit(1);
  }

  const record = await db.getCase(caseId);
  if (!record) {
    console.error(`No case with id ${caseId}`);
    process.exit(1);
  }

  console.log(`Case: ${record.title} (currently at round ${record.round})`);
  console.log(`AI provider: ${activeProviderName()}`);

  const opts = {
    caseId,
    transcriptsOnly: args.transcriptsOnly,
    minChars: args.minChars,
    batchSize: args.batch,
    maxRounds: args.maxRounds,
    side: args.side,
    strength: args.strength,
    emotional: args.emotional,
    authority: args.authority,
    log: (m: string) => console.log(m),
  };

  if (args.dryRun) {
    await ingest({ ...opts, dryRun: true });
    return;
  }

  const preview = await selectBatches(opts);
  const calls = preview.batches.length * 12;
  console.log(
    `\nAbout to run ${preview.batches.length} round(s) — roughly ${calls} model calls.`,
  );

  if (!args.yes) {
    const go = await confirm('Proceed? [y/N] ');
    if (!go) {
      console.log('Aborted.');
      return;
    }
  }

  const started = Date.now();
  resetProviderStats();
  const result = await ingest(opts);
  const mins = ((Date.now() - started) / 60000).toFixed(1);

  console.log(
    `\nDone — ${result.roundsRun} rounds from ${result.entriesUsed} entries in ${mins} min.` +
      (result.finalLean === null
        ? ''
        : ` Final simulated lean ${result.finalLean >= 0 ? '+' : ''}${result.finalLean.toFixed(2)}.`),
  );
  const st = providerStats();
  if (st.fallbacks > 0) {
    const pct = ((st.fallbacks / Math.max(1, st.calls)) * 100).toFixed(1);
    console.log(
      `\n⚠  ${st.fallbacks}/${st.calls} juror calls (${pct}%) fell back to the offline heuristic — ` +
        'those jurors were not reasoned by the model.',
    );
    console.log('   Usually rate limits: lower AI_CONCURRENCY or raise AI_MAX_RETRIES, then reset and re-run.');
  }
  console.log('Reminder: this is a simulation, not a finding about anyone.');
}

main()
  .then(async () => {
    await db.getPool().end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Ingest failed:', err);
    process.exit(1);
  });
