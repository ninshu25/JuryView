import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { aggregate } from '../sim/engine.js';
import { ARCHETYPES, buildJury } from '../sim/personalities.js';
import * as db from '../store/db.js';
import { DISCLAIMER, TRAIT_KEYS, clamp, type JurorPosition, type JurorTraits } from '../types.js';

export const portalRouter = Router();

/**
 * A soft gate, not real authentication. It keeps the back office out of casual
 * reach; it is NOT a security boundary and should never be exposed publicly
 * without putting proper auth in front of it.
 */
function portalPassword(): string {
  return process.env.PORTAL_PASSWORD || 'notajury';
}

function tokenFor(password: string): string {
  return createHash('sha256').update(`notajury:${password}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

portalRouter.post('/session', (req, res) => {
  const supplied = String(req.body?.password ?? '');
  if (!supplied || !safeEqual(supplied, portalPassword())) {
    return res.status(401).json({ error: 'Incorrect passphrase' });
  }
  res.json({ token: tokenFor(portalPassword()) });
});

function requirePortal(req: Request, res: Response, next: NextFunction) {
  const token = String(req.headers['x-portal-key'] ?? '');
  if (!token || !safeEqual(token, tokenFor(portalPassword()))) {
    return res.status(401).json({ error: 'Not signed in to the portal' });
  }
  next();
}

portalRouter.use(requirePortal);

/* --------------------------------------------------------------- overview */

portalRouter.get('/overview', async (_req, res, next) => {
  try {
    const cases = await db.listCases();
    const withStats = await Promise.all(
      cases.map(async (c) => ({ ...c, stats: await db.caseStats(c.id) })),
    );
    const sources = await db.listSources();
    res.json({ cases: withStats, sources, disclaimer: DISCLAIMER });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ cases */

portalRouter.post('/cases', async (req, res, next) => {
  try {
    const { title, summary, defendant, charge, realCase, sourceNote, linkOrphanSources } =
      req.body ?? {};
    if (!title) return res.status(400).json({ error: 'title is required' });

    const id = randomUUID();
    const record = await db.createCase({
      id,
      title: String(title).slice(0, 200),
      summary: String(summary ?? '').slice(0, 5000),
      defendant: String(defendant ?? '').slice(0, 200),
      charge: String(charge ?? '').slice(0, 300),
      realCase: Boolean(realCase),
      sourceNote: String(sourceNote ?? '').slice(0, 500),
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

    const linked = linkOrphanSources ? await db.linkSourcesToCase(id) : 0;
    res.status(201).json({ case: record, jurors, linkedSources: linked });
  } catch (err) {
    next(err);
  }
});

portalRouter.patch('/cases/:id', async (req, res, next) => {
  try {
    const updated = await db.updateCaseMeta(req.params.id, req.body ?? {});
    if (!updated) return res.status(404).json({ error: 'case not found' });
    res.json({ case: updated });
  } catch (err) {
    next(err);
  }
});

portalRouter.delete('/cases/:id', async (req, res, next) => {
  try {
    await db.deleteCase(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

portalRouter.post('/cases/:id/link-sources', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.sourceIds) ? req.body.sourceIds : undefined;
    res.json({ linked: await db.linkSourcesToCase(req.params.id, ids) });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------------------- jurors */

portalRouter.get('/cases/:id/jurors', async (req, res, next) => {
  try {
    res.json({ jurors: await db.getJurors(req.params.id) });
  } catch (err) {
    next(err);
  }
});

/**
 * Re-applies the current roster (names, archetypes, bios) by seat. Jurors are
 * written per case, so a case created before the roster changed keeps its old
 * names until this is run. Traits are left alone unless asked for.
 */
portalRouter.post('/cases/:id/jurors/refresh', async (req, res, next) => {
  try {
    const resetTraits = Boolean(req.body?.resetTraits);
    const jurors = await db.getJurors(req.params.id);
    if (jurors.length === 0) return res.status(404).json({ error: 'no jurors for this case' });

    for (const juror of jurors) {
      const template = ARCHETYPES[juror.seat - 1];
      if (!template) continue;
      await db.updateJuror(juror.id, {
        name: template.name,
        archetype: template.archetype,
        bio: template.bio,
        traits: resetTraits ? template.traits : undefined,
      });
    }

    res.json({ jurors: await db.getJurors(req.params.id) });
  } catch (err) {
    next(err);
  }
});

portalRouter.patch('/jurors/:id', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    let traits: JurorTraits | undefined;

    if (body.traits && typeof body.traits === 'object') {
      traits = {} as JurorTraits;
      for (const key of TRAIT_KEYS) {
        traits[key] = clamp(Number(body.traits[key] ?? 0.5));
      }
    }

    const updated = await db.updateJuror(req.params.id, {
      name: typeof body.name === 'string' ? body.name.slice(0, 120) : undefined,
      archetype: typeof body.archetype === 'string' ? body.archetype.slice(0, 80) : undefined,
      bio: typeof body.bio === 'string' ? body.bio.slice(0, 600) : undefined,
      traits,
    });
    if (!updated) return res.status(404).json({ error: 'juror not found' });
    res.json({ juror: updated });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------- scraped evidence pool */

portalRouter.get('/cases/:id/entries', async (req, res, next) => {
  try {
    const onlyUnpromoted = req.query.pending === 'true';
    const entries = await db.listEntriesChronological({
      caseId: req.params.id,
      onlyUnpromoted,
    });
    const limit = Math.min(500, Number(req.query.limit ?? 200));
    res.json({ total: entries.length, entries: entries.slice(0, limit) });
  } catch (err) {
    next(err);
  }
});
