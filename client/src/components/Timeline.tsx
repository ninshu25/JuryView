import { LEANING_COLORS } from '../theme';
import { Icon, type IconName } from './Icon';
import { TranscriptView } from './TranscriptView';
import type { JurySnapshot, Side, TrialEvent } from '../types';

interface Props {
  events: TrialEvent[];
  snapshots: JurySnapshot[];
  activeRound: number | null;
  onSelect: (round: number) => void;
}

const SIDE_COLOR: Record<Side, string> = {
  prosecution: LEANING_COLORS.guilty,
  defence: LEANING_COLORS.not_guilty,
  neutral: '#8b93a5',
};

const KIND_ICON: Record<string, IconName> = {
  evidence: 'evidence',
  testimony: 'testimony',
  argument: 'argument',
  instruction: 'instruction',
  objection: 'objection',
  cross_examination: 'cross-examination',
};

export function Timeline({ events, snapshots, activeRound, onSelect }: Props) {
  if (events.length === 0) {
    return (
      <div className="empty-hint">
        No trial events yet. Introduce evidence to start the simulated deliberation.
      </div>
    );
  }

  const snapshotByRound = new Map(snapshots.map((s) => [s.round, s]));

  return (
    <div className="timeline">
      {[...events].reverse().map((event) => {
        const snapshot = snapshotByRound.get(event.round);
        const previous = snapshotByRound.get(event.round - 1);
        const shift =
          snapshot && previous ? snapshot.juryLean - previous.juryLean : (snapshot?.juryLean ?? 0);
        const shiftColor =
          shift > 0.01
            ? LEANING_COLORS.guilty
            : shift < -0.01
              ? LEANING_COLORS.not_guilty
              : 'var(--ink-3)';

        return (
          <button
            type="button"
            key={event.id}
            className={`timeline-item ${activeRound === event.round ? 'active' : ''}`}
            onClick={() => onSelect(event.round)}
          >
            <div className="timeline-round">
              <Icon name={KIND_ICON[event.kind] ?? 'evidence'} size={15} />
              R{event.round}
            </div>
            <div>
              <div className="timeline-title">{event.title}</div>
              <div className="timeline-meta">
                <span
                  className="side-tag"
                  style={{ color: SIDE_COLOR[event.side], borderColor: SIDE_COLOR[event.side] }}
                >
                  {event.side}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                  {event.kind.replace('_', ' ')}
                </span>
                {event.transcript?.length > 0 && (
                  <span className="transcript-badge">transcript</span>
                )}
                <span className="timeline-shift" style={{ color: shiftColor }}>
                  {shift > 0 ? '▲ +' : shift < 0 ? '▼ ' : '– '}
                  {Math.abs(shift) >= 0.005 ? shift.toFixed(2) : '0.00'}
                </span>
              </div>
              {activeRound === event.round && (
                <>
                  {event.content && <div className="timeline-content">{event.content}</div>}
                  {event.transcript?.length > 0 && (
                    <TranscriptView lines={event.transcript} />
                  )}
                </>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
