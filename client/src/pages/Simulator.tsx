import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Courtroom } from '../components/Courtroom';
import { Icon, type IconName } from '../components/Icon';
import { JuryGauge } from '../components/JuryGauge';
import { JurorPanel } from '../components/JurorPanel';
import { LeanChart } from '../components/LeanChart';
import { Drawer, Sheet } from '../components/Overlays';
import { StatsBar } from '../components/StatsBar';
import { Timeline } from '../components/Timeline';
import { WhyChanged } from '../components/WhyChanged';
import type { CaseState } from '../types';

type DockPanel = 'timeline' | 'trend' | 'why' | null;

export function Simulator() {
  const [state, setState] = useState<CaseState | null>(null);
  const [selectedJuror, setSelectedJuror] = useState<string | null>(null);
  const [panel, setPanel] = useState<DockPanel>(null);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { cases } = await api.listCases();
        if (cases.length === 0) {
          setError('No cases found. Restart the server with SEED_DEMO=true, or POST /api/cases.');
          return;
        }
        setState(await api.getCase(cases[0].id));
      } catch (err) {
        setError(`Could not reach the NOTaJury API: ${(err as Error).message}.`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const run = useCallback(async (fn: () => Promise<CaseState>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setState(next);
      setActiveRound(next.case.round);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const positions = useMemo(
    () => new Map((state?.positions ?? []).map((p) => [p.jurorId, p])),
    [state],
  );
  const latestSnapshot = state?.snapshots.at(-1) ?? null;
  const currentRound = state?.case.round ?? 0;
  const currentInfluences = useMemo(
    () => (state?.influences ?? []).filter((i) => i.round === currentRound),
    [state, currentRound],
  );
  const selected = state?.jurors.find((j) => j.id === selectedJuror) ?? null;

  if (loading) {
    return (
      <div className="center-screen">
        <div>
          <div className="spinner" />
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading NOTaJury…</div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="center-screen">
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ fontFamily: 'var(--serif)' }}>NOTaJury</h1>
          <p style={{ color: 'var(--ink-3)', fontSize: 13.5, lineHeight: 1.6 }}>
            {error ?? 'No case loaded.'}
          </p>
          <Link className="btn" to="/">
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  const realCase = state.case.realCase;

  const dock: Array<[Exclude<DockPanel, null>, IconName, string]> = [
    ['why', 'insight', 'Why it changed'],
    ['trend', 'chart', 'Trend'],
    ['timeline', 'list', `Timeline (${state.events.length})`],
  ];

  return (
    <div className="sim">
      <header className="sim-bar">
        <Link to="/" className="wordmark compact">
          <Icon name="scales" size={19} className="scales" />
          <span className="mark">NOTaJury</span>
        </Link>

        <div className="case-strip">
          <div className="case-title">{state.case.title}</div>
          <div className="case-charge">{state.case.charge}</div>
        </div>

        <button
          type="button"
          className={`sim-badge ${realCase ? 'severe' : ''}`}
          onClick={() => setNoticeOpen(true)}
        >
          {realCase && <Icon name="objection" size={12} />}
          {realCase ? 'Real case · AI simulation' : 'AI simulation'}
          <span className="badge-more">what this means</span>
        </button>

        <div className="sim-meta">
          <span className="chip">
            round <strong>{currentRound}</strong>
          </span>
          <span className="chip">{state.aiProvider}</span>
          <Link className="chip link" to="/paper">
            How it works
          </Link>
        </div>
      </header>

      <main className="sim-stage">
        <section className="stage-court">
          <Courtroom
            jurors={state.jurors}
            positions={positions}
            influences={currentInfluences}
            selectedId={selectedJuror}
            onSelect={setSelectedJuror}
            round={currentRound}
            busy={busy}
          />
        </section>

        <aside className="stage-rail">
          <JuryGauge snapshot={latestSnapshot} />
          <StatsBar snapshot={latestSnapshot} jurorCount={state.jurors.length} />

          <dl className="case-file">
            <div>
              <dt>Defendant</dt>
              <dd>{state.case.defendant || '—'}</dd>
            </div>
            <div>
              <dt>Charge</dt>
              <dd>{state.case.charge || '—'}</dd>
            </div>
            {state.case.sourceNote && (
              <div>
                <dt>Material</dt>
                <dd>{state.case.sourceNote}</dd>
              </div>
            )}
          </dl>

          {state.lastChange && (
            <button type="button" className="rail-why" onClick={() => setPanel('why')}>
              <span className="rail-why-label">Latest shift</span>
              <span className="rail-why-text">{state.lastChange.headline}</span>
              <span className="rail-why-more">See what caused it →</span>
            </button>
          )}
        </aside>
      </main>

      <nav className="dock">
        <span className="dock-note">
          {realCase ? 'Simulated positions — not findings about real people' : 'Simulated positions — not a verdict'}
        </span>
        <div className="dock-actions">
          {dock.map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              className={`dock-btn ${panel === key ? 'active' : ''}`}
              onClick={() => setPanel(panel === key ? null : key)}
              disabled={busy}
            >
              <Icon name={icon} size={15} /> {label}
            </button>
          ))}
        </div>
      </nav>

      {/* ------------------------------------------------------- overlays */}

      <Drawer
        open={Boolean(selected)}
        title={selected?.archetype ?? ''}
        subtitle={selected?.name}
        onClose={() => setSelectedJuror(null)}
      >
        <JurorPanel
          juror={selected}
          position={selected ? positions.get(selected.id) ?? null : null}
          history={state.history}
        />
      </Drawer>

      <Sheet
        open={panel === 'why'}
        title="Why did the jury change?"
        subtitle={`Round ${state.lastChange?.round ?? currentRound}`}
        onClose={() => setPanel(null)}
      >
        <WhyChanged
          change={state.lastChange}
          onSelectJuror={(id) => {
            setPanel(null);
            setSelectedJuror(id);
          }}
        />
      </Sheet>

      <Sheet
        open={panel === 'trend'}
        title="Jury position over the trial"
        subtitle="Each round is one item of evidence or one deliberation"
        onClose={() => setPanel(null)}
      >
        <LeanChart snapshots={state.snapshots} events={state.events} />
      </Sheet>

      <Sheet
        open={panel === 'timeline'}
        title="Evidence & trial timeline"
        subtitle="Select an entry to read the material the agents were given"
        onClose={() => setPanel(null)}
      >
        <Timeline
          events={state.events}
          snapshots={state.snapshots}
          activeRound={activeRound}
          onSelect={(round) => setActiveRound(activeRound === round ? null : round)}
        />
      </Sheet>

      <Sheet
        open={noticeOpen}
        title="This is an AI simulation"
        subtitle="Read this before showing the output to anyone"
        onClose={() => setNoticeOpen(false)}
      >
        <div className="notice-body">
          <p>
            NOTaJury runs twelve synthetic agents with invented personalities over material
            you supply. It models <em>deliberation dynamics</em> — how a group's stated views
            drift as things are put to it. That is all it does.
          </p>
          <p>
            <strong>The output is not a determination of guilt or innocence.</strong> It is not
            evidence, not a prediction of a real jury, and carries no legal weight. The agents
            have no access to the full record, no ability to assess a witness in person, and no
            accountability. A number like "67% guilty" is a property of this model, not of the
            case.
          </p>
          {realCase && (
            <p className="notice-severe">
              This case is flagged as involving <strong>real, identifiable people in a real
              proceeding</strong>. Simulated leanings about a named defendant can do genuine
              harm if presented as findings, or if a screenshot travels without this context.
              Treat the output as a study of the model, keep the labelling attached to anything
              you export, and do not publish it as commentary on anyone's actual culpability.
            </p>
          )}
          {state.case.sourceNote && (
            <p className="notice-source">
              <strong>Source:</strong> {state.case.sourceNote}
            </p>
          )}
          <p>
            The full method, including the trait maths and its limitations, is in the{' '}
            <Link to="/paper">white paper</Link>.
          </p>
        </div>
      </Sheet>

      {busy && <div className="busy-pill">12 agents deliberating…</div>}

      {error && (
        <div className="toast" role="alert">
          {error}
          <button
            type="button"
            className="btn ghost"
            style={{ marginLeft: 10, padding: '2px 8px', fontSize: 11 }}
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
