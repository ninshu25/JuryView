import { LEANING_COLORS } from '../theme';
import {
  LEANING_LABELS,
  TRAIT_KEYS,
  TRAIT_LABELS,
  type Juror,
  type JurorPosition,
} from '../types';

interface Props {
  juror: Juror | null;
  position: JurorPosition | null;
  history: JurorPosition[];
}

export function JurorPanel({ juror, position, history }: Props) {
  if (!juror) {
    return (
      <div className="empty-hint">
        Select any juror in the box above to inspect their personality traits,
        current position, confidence and reasoning.
      </div>
    );
  }

  const leaning = position?.leaning ?? 'uncertain';
  const color = LEANING_COLORS[leaning];
  const mine = history.filter((h) => h.jurorId === juror.id).sort((a, b) => a.round - b.round);

  return (
    <div className="juror-detail">
      <div className="juror-detail-head">
        <div
          className="juror-avatar"
          style={{
            background: `${color}2e`,
            borderColor: color,
            flexShrink: 0,
            width: 44,
            height: 44,
          }}
        >
          {juror.seat}
        </div>
        {/* The archetype and name are already in the drawer header above. */}
        <div style={{ minWidth: 0 }}>
          <div className="bio">{juror.bio}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="verdict-pill" style={{ color, borderColor: color, background: `${color}18` }}>
          <span className="dot" style={{ background: color }} /> {LEANING_LABELS[leaning]}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
          lean{' '}
          <strong style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>
            {(position?.lean ?? 0) > 0 ? '+' : ''}
            {(position?.lean ?? 0).toFixed(2)}
          </strong>
          {' · '}confidence{' '}
          <strong style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>
            {Math.round((position?.confidence ?? 0) * 100)}%
          </strong>
        </span>
      </div>

      {mine.length > 1 && <Sparkline points={mine} color={color} />}

      <div>
        <div className="section-label" style={{ marginTop: 0 }}>
          Current reasoning
        </div>
        <div className="reasoning-quote">
          {position?.reasoning ?? 'No position formed yet.'}
        </div>
      </div>

      {position?.keyFactors && position.keyFactors.length > 0 && (
        <div>
          <div className="section-label" style={{ marginTop: 0 }}>
            What is driving them
          </div>
          <div className="factor-tags">
            {position.keyFactors.map((f, i) => (
              <span key={i} className="factor-tag">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="section-label" style={{ marginTop: 0 }}>
          Personality traits
        </div>
        <div className="trait-list">
          {TRAIT_KEYS.map((key) => (
            <div className="trait-row" key={key}>
              <span className="trait-name">{TRAIT_LABELS[key]}</span>
              <span className="trait-track">
                <span className="trait-fill" style={{ width: `${juror.traits[key] * 100}%` }} />
              </span>
              <span className="trait-value">{juror.traits[key].toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** This agent's lean across every round so far, -1 (bottom) to +1 (top). */
function Sparkline({ points, color }: { points: JurorPosition[]; color: string }) {
  const w = 100;
  const h = 34;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  // Jury leans rarely leave ±0.5, so plotting against the full ±1 range makes
  // every trace look flat. Scale to the data, with a floor so a genuinely
  // steady juror still reads as steady rather than being amplified to noise.
  const extent = Math.max(0.25, ...points.map((p) => Math.abs(p.lean)));
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h / 2 - (p.lean / extent) * (h / 2 - 3)}`)
    .join(' ');

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0 }}>
        Position over {points.length} rounds
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#333b4d" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
