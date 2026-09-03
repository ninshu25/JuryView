import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { activeProviderName } from './ai/index.js';
import { casesRouter } from './routes/cases.js';
import { portalRouter } from './routes/portal.js';
import { sourcesRouter } from './routes/sources.js';
import { SUGGESTED_EVENTS, seedDemoCase } from './seed.js';
import * as db from './store/db.js';
import { DISCLAIMER } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config(); // also honour a server/.env if present

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  let database = 'ok';
  try {
    await db.getPool().query('SELECT 1');
  } catch (err) {
    database = `error: ${(err as Error).message}`;
  }
  res.json({
    status: 'ok',
    database,
    aiProvider: activeProviderName(),
    disclaimer: DISCLAIMER,
  });
});

/** Ready-made trial events the UI offers as one-click inputs. */
app.get('/api/suggested-events', (_req, res) => {
  res.json({ events: SUGGESTED_EVENTS });
});

app.use('/api/cases', casesRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/portal', portalRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'internal error' });
});

const port = Number(process.env.PORT || 4000);

async function main() {
  await db.migrate();
  console.log('[db] schema ready');

  if (process.env.SEED_DEMO !== 'false') {
    await seedDemoCase();
  }

  app.listen(port, () => {
    console.log(`\n  NOTaJury API on http://localhost:${port}`);
    console.log(`  AI provider: ${activeProviderName()}`);
    console.log(`  ${DISCLAIMER}\n`);
  });
}

main().catch((err) => {
  console.error('Failed to start NOTaJury server:', err);
  process.exit(1);
});
