import { Router } from 'express';
import * as db from '../store/db.js';
import { DISCLAIMER } from '../types.js';

export const sourcesRouter = Router();

/** Every scraped article, newest fetch first. */
sourcesRouter.get('/', async (req, res, next) => {
  try {
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : undefined;
    res.json({ sources: await db.listSources(caseId), disclaimer: DISCLAIMER });
  } catch (err) {
    next(err);
  }
});

/** The individual live-blog posts pulled out of one article. */
sourcesRouter.get('/:id/entries', async (req, res, next) => {
  try {
    const entries = await db.listSourceEntries(req.params.id);
    res.json({
      entries,
      counts: {
        total: entries.length,
        withTranscript: entries.filter((e) => (e.transcript as unknown[]).length > 0).length,
        promoted: entries.filter((e) => e.promotedEventId).length,
      },
      disclaimer: DISCLAIMER,
    });
  } catch (err) {
    next(err);
  }
});
