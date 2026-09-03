import { Icon } from './Icon';
import { LEANING_COLORS } from '../theme';
import type { JurySnapshot } from '../types';

interface Props {
  snapshot: JurySnapshot | null;
  jurorCount: number;
}

export function StatsBar({ snapshot, jurorCount }: Props) {
  const guilty = snapshot?.guiltyPct ?? 0;
  const notGuilty = snapshot?.notGuiltyPct ?? 0;
  const uncertain = snapshot?.uncertainPct ?? 100;
  const consensus = snapshot?.consensus ?? 0;
  const confidence = snapshot?.confidence ?? 0;

  const tiles = [
    { label: 'Guilty', pct: guilty, color: LEANING_COLORS.guilty },
    { label: 'Not guilty', pct: notGuilty, color: LEANING_COLORS.not_guilty },
    { label: 'Uncertain', pct: uncertain, color: LEANING_COLORS.uncertain },
  ];

  return (
    <div>
      <div className="stat-grid">
        {tiles.map((t) => (
          <div key={t.label} className="stat" style={{ ['--accent' as string]: t.color }}>
            <div className="stat-value">{Math.round(t.pct)}%</div>
            <div className="stat-label">{t.label}</div>
            <div className="stat-count">
              {Math.round((t.pct / 100) * jurorCount)} of {jurorCount} jurors
            </div>
          </div>
        ))}
      </div>

      <div className="meter-row">
        <div className="meter">
          <div className="meter-head">
            <span>Consensus</span>
            <strong>{Math.round(consensus * 100)}%</strong>
          </div>
          <div className="meter-track">
            <div
              className="meter-fill"
              style={{ width: `${consensus * 100}%`, background: 'var(--brass)' }}
            />
          </div>
        </div>
        <div className="meter">
          <div className="meter-head">
            <span>Mean confidence</span>
            <strong>{Math.round(confidence * 100)}%</strong>
          </div>
          <div className="meter-track">
            <div
              className="meter-fill"
              style={{ width: `${confidence * 100}%`, background: '#7d8aa3' }}
            />
          </div>
        </div>
      </div>

      {snapshot?.unanimous && (
        <div
          style={{
            marginTop: 12,
            padding: '9px 12px',
            borderRadius: 9,
            background: 'rgba(201,162,39,0.12)',
            border: '1px solid rgba(201,162,39,0.4)',
            fontSize: 12.5,
            color: '#e6cd7d',
          }}
        >
          <Icon name="scales" size={13} /> All 12 simulated jurors currently sit in the same bloc — a unanimous
          simulated position (still not a verdict).
        </div>
      )}
    </div>
  );
}
