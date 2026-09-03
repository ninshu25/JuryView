import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { EventComposer } from '../components/EventComposer';
import { Icon, type IconName } from '../components/Icon';
import { TranscriptView } from '../components/TranscriptView';
import {
  portalApi,
  portalAuth,
  type PortalCase,
  type PortalEntry,
  type PortalSource,
} from '../portalApi';
import { LEANING_COLORS } from '../theme';
import {
  TRAIT_KEYS,
  TRAIT_LABELS,
  type CaseState,
  type Juror,
  type JurorTraits,
  type SuggestedEvent,
  type TrialEvent,
} from '../types';

type Tab = 'trials' | 'jurors' | 'evidence' | 'sources';

const TABS: Array<[Tab, string, IconName]> = [
  ['trials', 'Trials', 'trials'],
  ['jurors', 'Jurors', 'jurors'],
  ['evidence', 'Evidence', 'evidence'],
  ['sources', 'Sources', 'sources'],
];

export function Portal() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('trials');
  const [cases, setCases] = useState<PortalCase[]>([]);
  const [sources, setSources] = useState<PortalSource[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await portalApi.overview();
      setCases(data.cases);
      setSources(data.sources);
      setActiveId((prev) => prev ?? data.cases[0]?.id ?? null);
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        portalAuth.clear();
        navigate('/login');
        return;
      }
      setError((err as Error).message);
    }
  }, [navigate]);

  useEffect(() => {
    if (!portalAuth.token) {
      navigate('/login');
      return;
    }
    void load();
  }, [load, navigate]);

  const active = cases.find((c) => c.id === activeId) ?? null;

  const run = useCallback(
    async (fn: () => Promise<unknown>, message?: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await fn();
        await load();
        if (message) setNotice(message);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  return (
    <div className="portal">
      <header className="portal-bar">
        <span className="wordmark">
          <Icon name="scales" size={19} className="scales" />
          <span className="mark">NOTaJury</span>
        </span>
        <span className="portal-tag">Back office</span>

        <nav className="portal-tabs">
          {TABS.map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              className={`portal-tab ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon name={icon} size={15} />
              {label}
            </button>
          ))}
        </nav>

        <div className="portal-bar-right">
          {active && (
            <Link className="chip link" to="/app" target="_blank" rel="noreferrer">
              View simulator <Icon name="external" size={12} />
            </Link>
          )}
          <button
            type="button"
            className="chip link"
            onClick={() => {
              portalAuth.clear();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="portal-subbar">
        <label htmlFor="case-select">Working case</label>
        <select
          id="case-select"
          value={activeId ?? ''}
          onChange={(e) => setActiveId(e.target.value || null)}
        >
          {cases.length === 0 && <option value="">No trials yet</option>}
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} — round {c.round}
            </option>
          ))}
        </select>
        {active?.realCase && (
          <span className="real-flag">
            <Icon name="objection" size={13} /> Real proceeding
          </span>
        )}
      </div>

      <main className="portal-body">
        {tab === 'trials' && (
          <TrialsPanel cases={cases} active={active} busy={busy} run={run} onSelect={setActiveId} />
        )}
        {tab === 'jurors' && <JurorsPanel caseId={activeId} busy={busy} run={run} />}
        {tab === 'evidence' && <EvidencePanel caseId={activeId} busy={busy} run={run} />}
        {tab === 'sources' && (
          <SourcesPanel sources={sources} caseId={activeId} busy={busy} run={run} />
        )}
      </main>

      {(error || notice) && (
        <div className={`portal-toast ${error ? 'bad' : ''}`} role="status">
          {error ?? notice}
          <button type="button" className="icon-btn" onClick={() => { setError(null); setNotice(null); }}>
            <Icon name="close" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ trials */

function TrialsPanel({
  cases, active, busy, run, onSelect,
}: {
  cases: PortalCase[];
  active: PortalCase | null;
  busy: boolean;
  run: (fn: () => Promise<unknown>, msg?: string) => Promise<void>;
  onSelect: (id: string) => void;
}) {
  const [draft, setDraft] = useState({
    title: '', defendant: '', charge: '', summary: '', sourceNote: '',
    realCase: true, linkOrphanSources: true,
  });

  return (
    <div className="portal-grid">
      <section className="panel">
        <header className="panel-head">
          <h2>Trials</h2>
          <span className="panel-count">{cases.length}</span>
        </header>
        <div className="panel-body">
          {cases.length === 0 && <p className="muted">No trials yet — create one on the right.</p>}
          {cases.map((c) => (
            <article
              key={c.id}
              className={`record ${active?.id === c.id ? 'selected' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <div className="record-main">
                <div className="record-title">{c.title}</div>
                <div className="record-meta">
                  {c.charge || 'no charge set'} · round {c.round}
                  {c.realCase && ' · real proceeding'}
                </div>
                <div className="record-stats">
                  <span>{c.stats.events} events</span>
                  <span>{c.stats.sources} sources</span>
                  <span>
                    {c.stats.promoted}/{c.stats.entries} entries used
                  </span>
                </div>
              </div>
              <div className="record-actions">
                <button
                  type="button"
                  className="btn tiny"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void run(() => api.reset(c.id), 'Trial reset — jurors kept, events cleared.');
                  }}
                >
                  <Icon name="reset" size={13} /> Reset
                </button>
                <button
                  type="button"
                  className="btn tiny danger"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete "${c.title}" and everything in it? This cannot be undone.`)) return;
                    void run(() => portalApi.deleteCase(c.id), 'Trial deleted.');
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>New trial</h2>
        </header>
        <div className="panel-body form">
          {([
            ['title', 'Title', 'The Republic of Malta v. …'],
            ['defendant', 'Defendant', 'Name as reported'],
            ['charge', 'Charge', 'e.g. Complicity in murder'],
          ] as Array<[keyof typeof draft, string, string]>).map(([key, label, ph]) => (
            <div className="field" key={key}>
              <label htmlFor={`t-${key}`}>{label}</label>
              <input
                id={`t-${key}`}
                type="text"
                value={String(draft[key])}
                placeholder={ph}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}

          <div className="field">
            <label htmlFor="t-summary">Case summary given to every juror</label>
            <textarea
              id="t-summary"
              rows={5}
              value={draft.summary}
              placeholder="The background the agents read before any evidence. This frames everything — keep it neutral."
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="t-source">Source note</label>
            <input
              id="t-source"
              type="text"
              value={draft.sourceNote}
              placeholder="Where the material comes from"
              onChange={(e) => setDraft({ ...draft, sourceNote: e.target.value })}
            />
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={draft.realCase}
              onChange={(e) => setDraft({ ...draft, realCase: e.target.checked })}
            />
            <span>
              Real proceeding — shows the hard warning in the simulator
            </span>
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={draft.linkOrphanSources}
              onChange={(e) => setDraft({ ...draft, linkOrphanSources: e.target.checked })}
            />
            <span>Attach all unlinked scraped sources to this trial</span>
          </label>

          <button
            type="button"
            className="btn primary"
            disabled={busy || !draft.title.trim()}
            onClick={() =>
              void run(async () => {
                await portalApi.createCase(draft);
                setDraft({
                  title: '', defendant: '', charge: '', summary: '', sourceNote: '',
                  realCase: true, linkOrphanSources: true,
                });
              }, 'Trial created with a fresh jury of twelve.')
            }
          >
            <Icon name="plus" size={15} /> Create trial
          </button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ jurors */

function JurorsPanel({
  caseId, busy, run,
}: {
  caseId: string | null;
  busy: boolean;
  run: (fn: () => Promise<unknown>, msg?: string) => Promise<void>;
}) {
  const [jurors, setJurors] = useState<Juror[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!caseId) return setJurors([]);
    const { jurors: list } = await portalApi.jurors(caseId);
    setJurors(list);
  }, [caseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!caseId) return <p className="muted pad">Select a trial first.</p>;

  return (
    <div className="panel wide">
      <header className="panel-head">
        <h2>Jury</h2>
        <span className="panel-count">{jurors.length}</span>
        <div className="panel-head-actions">
          <button
            type="button"
            className="btn tiny"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await portalApi.refreshJurors(caseId, false);
                await reload();
              }, 'Names and biographies re-applied from the current roster.')
            }
          >
            <Icon name="reset" size={13} /> Re-apply roster names
          </button>
          <button
            type="button"
            className="btn tiny"
            disabled={busy}
            onClick={() => {
              if (!confirm('Reset every juror to the default traits for their seat?')) return;
              void run(async () => {
                await portalApi.refreshJurors(caseId, true);
                await reload();
              }, 'Jurors reset to default personalities.');
            }}
          >
            Reset traits
          </button>
        </div>
      </header>

      <div className="panel-body">
        {jurors.map((j) => (
          <JurorRow
            key={j.id}
            juror={j}
            open={openId === j.id}
            busy={busy}
            onToggle={() => setOpenId(openId === j.id ? null : j.id)}
            onSave={(traits) =>
              run(async () => {
                await portalApi.patchJuror(j.id, { traits });
                await reload();
              }, `${j.archetype} updated.`)
            }
          />
        ))}
      </div>
    </div>
  );
}

function JurorRow({
  juror, open, busy, onToggle, onSave,
}: {
  juror: Juror;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (traits: JurorTraits) => Promise<void>;
}) {
  const [traits, setTraits] = useState<JurorTraits>(juror.traits);
  useEffect(() => setTraits(juror.traits), [juror]);

  const dirty = useMemo(
    () => TRAIT_KEYS.some((k) => traits[k] !== juror.traits[k]),
    [traits, juror],
  );

  return (
    <article className={`record juror-record ${open ? 'selected' : ''}`}>
      <div className="record-main" onClick={onToggle} role="button" tabIndex={0}
           onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <span className="seat-badge">{juror.seat}</span>
        <div>
          <div className="record-title">{juror.name}</div>
          <div className="record-meta">{juror.archetype}</div>
        </div>
        <span className={`chevron ${open ? 'open' : ''}`}>
          <Icon name="chevron" size={14} />
        </span>
      </div>

      {open && (
        <div className="juror-edit">
          <p className="muted small">{juror.bio}</p>
          {TRAIT_KEYS.map((key) => (
            <div className="slider-row" key={key}>
              <span>{TRAIT_LABELS[key]}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={traits[key]}
                onChange={(e) => setTraits({ ...traits, [key]: Number(e.target.value) })}
              />
              <span className="num">{traits[key].toFixed(2)}</span>
            </div>
          ))}
          <div className="btn-row">
            <button
              type="button"
              className="btn primary tiny"
              disabled={busy || !dirty}
              onClick={() => void onSave(traits)}
            >
              <Icon name="check" size={13} /> Save traits
            </button>
            <button
              type="button"
              className="btn tiny"
              disabled={!dirty}
              onClick={() => setTraits(juror.traits)}
            >
              Revert
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- evidence */

function EvidencePanel({
  caseId, busy, run,
}: {
  caseId: string | null;
  busy: boolean;
  run: (fn: () => Promise<unknown>, msg?: string) => Promise<void>;
}) {
  const [state, setState] = useState<CaseState | null>(null);
  const [entries, setEntries] = useState<PortalEntry[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestedEvent[]>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!caseId) return;
    const [caseState, pool, presets] = await Promise.all([
      api.getCase(caseId),
      portalApi.entries(caseId, true),
      api.suggestedEvents(),
    ]);
    setState(caseState);
    setEntries(pool.entries);
    setPendingTotal(pool.total);
    setSuggestions(presets.events);
  }, [caseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!caseId) return <p className="muted pad">Select a trial first.</p>;

  const events: TrialEvent[] = state?.events ?? [];

  return (
    <div className="portal-grid">
      <section className="panel">
        <header className="panel-head">
          <h2>Put evidence to the jury</h2>
        </header>
        <div className="panel-body">
          <p className="muted small">
            Each submission runs one full round — twelve model calls, one per juror.
          </p>
          <EventComposer
            suggestions={suggestions}
            usedTitles={new Set(events.map((e) => e.title))}
            busy={busy}
            onSubmit={(event) =>
              void run(async () => {
                await api.addEvent(caseId, event);
                await reload();
              }, 'Round complete.')
            }
            onDeliberate={() =>
              void run(async () => {
                await api.deliberate(caseId);
                await reload();
              }, 'Deliberation round complete.')
            }
            onReset={() => {
              if (!confirm('Clear all events for this trial?')) return;
              void run(async () => {
                await api.reset(caseId);
                await reload();
              }, 'Trial reset.');
            }}
          />
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Scraped, not yet used</h2>
          <span className="panel-count">{pendingTotal}</span>
        </header>
        <div className="panel-body scroll">
          {entries.length === 0 && (
            <p className="muted small">
              Nothing pending. Scrape URLs with <code>npm run scrape</code>, then attach the
              sources to this trial under Sources.
            </p>
          )}
          {entries.slice(0, 60).map((entry) => (
            <article key={entry.id} className="record compact">
              <div
                className="record-main"
                role="button"
                tabIndex={0}
                onClick={() => setOpenEntry(openEntry === entry.id ? null : entry.id)}
                onKeyDown={(e) => e.key === 'Enter' && setOpenEntry(openEntry === entry.id ? null : entry.id)}
              >
                <div>
                  <div className="record-title">{entry.heading || 'Untitled entry'}</div>
                  <div className="record-meta">
                    {entry.postedAt ? new Date(entry.postedAt).toLocaleString() : 'no timestamp'}
                    {entry.transcript.length > 0 && ` · ${entry.transcript.length} transcript lines`}
                  </div>
                </div>
              </div>
              <div className="record-actions">
                <button
                  type="button"
                  className="btn tiny primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.promoteEntry(caseId, entry.id, {});
                      await reload();
                    }, 'Round complete.')
                  }
                >
                  Put to jury
                </button>
              </div>
              {openEntry === entry.id && (
                <div className="entry-detail">
                  <p>{entry.body}</p>
                  {entry.transcript.length > 0 && <TranscriptView lines={entry.transcript} />}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="panel span">
        <header className="panel-head">
          <h2>Events in this trial</h2>
          <span className="panel-count">{events.length}</span>
        </header>
        <div className="panel-body scroll">
          {events.length === 0 && <p className="muted small">No rounds run yet.</p>}
          {[...events].reverse().map((e) => {
            const snap = state?.snapshots.find((s) => s.round === e.round);
            return (
              <article key={e.id} className="record compact">
                <div className="record-main">
                  <span className="round-badge">R{e.round}</span>
                  <div>
                    <div className="record-title">{e.title}</div>
                    <div className="record-meta">
                      {e.kind.replace('_', ' ')} · {e.side}
                      {e.transcript.length > 0 && ' · transcript'}
                    </div>
                  </div>
                </div>
                {snap && (
                  <div className="record-actions mono">
                    <span style={{ color: LEANING_COLORS.guilty }}>{Math.round(snap.guiltyPct)}%</span>
                    <span style={{ color: LEANING_COLORS.not_guilty }}>{Math.round(snap.notGuiltyPct)}%</span>
                    <span style={{ color: LEANING_COLORS.uncertain }}>{Math.round(snap.uncertainPct)}%</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- sources */

function SourcesPanel({
  sources, caseId, busy, run,
}: {
  sources: PortalSource[];
  caseId: string | null;
  busy: boolean;
  run: (fn: () => Promise<unknown>, msg?: string) => Promise<void>;
}) {
  const orphans = sources.filter((s) => !s.caseId);

  return (
    <div className="panel wide">
      <header className="panel-head">
        <h2>Scraped sources</h2>
        <span className="panel-count">{sources.length}</span>
        {orphans.length > 0 && caseId && (
          <div className="panel-head-actions">
            <button
              type="button"
              className="btn tiny primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () => portalApi.linkSources(caseId),
                  `${orphans.length} source(s) attached to this trial.`,
                )
              }
            >
              Attach {orphans.length} unlinked to this trial
            </button>
          </div>
        )}
      </header>
      <div className="panel-body">
        <p className="muted small">
          Add URLs to <code>urls.txt</code> and run <code>npm run scrape --prefix server</code>.
          Already-scraped URLs are skipped unless you pass <code>--force</code>.
        </p>
        {sources.map((s) => (
          <article key={s.id} className="record compact">
            <div className="record-main">
              <div>
                <div className="record-title">{s.title || s.url}</div>
                <div className="record-meta">
                  {s.publisher} · {s.entryCount} entries ·{' '}
                  {new Date(s.fetchedAt).toLocaleDateString()}
                  {!s.caseId && ' · not attached'}
                </div>
                {s.status !== 'ok' && <div className="record-error">{s.error}</div>}
              </div>
            </div>
            <div className="record-actions">
              <a className="btn tiny" href={s.url} target="_blank" rel="noreferrer">
                <Icon name="external" size={13} />
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
