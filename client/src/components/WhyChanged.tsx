import { Icon } from './Icon';
import { LEANING_COLORS } from '../theme';
import type { ChangeAttribution } from '../types';

interface Props {
  change: ChangeAttribution | null;
  onSelectJuror: (id: string) => void;
}

export function WhyChanged({ change, onSelectJuror }: Props) {
  if (!change) {
    return (
      <div className="empty-hint">
        Once evidence is introduced, this panel explains which item moved the jury
        and which agents pulled the others with them.
      </div>
    );
  }

  const deltaColor =
    change.leanDelta > 0.01
      ? LEANING_COLORS.guilty
      : change.leanDelta < -0.01
        ? LEANING_COLORS.not_guilty
        : 'var(--ink-3)';

  return (
    <div>
      <div className="why-headline">{change.headline}</div>

      <div style={{ display: 'flex', gap: 18, fontSize: 12, color: 'var(--ink-3)' }}>
        <span>
          Jury lean{' '}
          <strong style={{ color: deltaColor, fontFamily: 'var(--mono)' }}>
            {change.leanDelta > 0 ? '+' : ''}
            {change.leanDelta.toFixed(2)}
          </strong>
        </span>
        <span>
          Consensus{' '}
          <strong style={{ color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
            {change.consensusDelta > 0 ? '+' : ''}
            {Math.round(change.consensusDelta * 100)}%
          </strong>
        </span>
      </div>

      {change.topMovers.length > 0 && (
        <>
          <div className="section-label">Who moved most</div>
          {change.topMovers.map((m) => (
            <div
              key={m.jurorId}
              className="mover-row"
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectJuror(m.jurorId)}
              onKeyDown={(e) => e.key === 'Enter' && onSelectJuror(m.jurorId)}
            >
              <div>
                <div className="mover-name">{m.name}</div>
                <div className="mover-split">
                  evidence {m.evidenceDelta > 0 ? '+' : ''}
                  {m.evidenceDelta.toFixed(2)} · peers {m.peerDelta > 0 ? '+' : ''}
                  {m.peerDelta.toFixed(2)}
                </div>
              </div>
              <div
                className="mover-delta"
                style={{
                  color: m.delta > 0 ? LEANING_COLORS.guilty : LEANING_COLORS.not_guilty,
                }}
              >
                {m.delta > 0 ? '+' : ''}
                {m.delta.toFixed(2)}
              </div>
            </div>
          ))}
        </>
      )}

      {change.topInfluencers.length > 0 && (
        <>
          <div className="section-label">Who persuaded whom</div>
          {change.topInfluencers.map((inf, i) => (
            <div key={i} className="influence-line">
              <span style={{ color: 'var(--ink)' }}>{shortName(inf.fromName)}</span>
              <span className="arrow"><Icon name="chevron" size={12} /></span>
              <span style={{ color: 'var(--ink)' }}>{shortName(inf.toName)}</span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--mono)',
                  fontSize: 10.5,
                  color: inf.magnitude > 0 ? LEANING_COLORS.guilty : LEANING_COLORS.not_guilty,
                }}
              >
                {inf.magnitude > 0 ? '+' : ''}
                {inf.magnitude.toFixed(2)}
              </span>
            </div>
          ))}
        </>
      )}

      {change.topMovers.length === 0 && (
        <div className="empty-hint" style={{ padding: '16px 0' }}>
          No agent shifted measurably in this round.
        </div>
      )}
    </div>
  );
}

function shortName(full: string): string {
  const parts = full.split('—');
  return (parts[1] ?? parts[0]).trim();
}
