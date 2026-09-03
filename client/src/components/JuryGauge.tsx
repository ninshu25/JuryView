import { motion } from 'framer-motion';
import { LEANING_COLORS } from '../theme';
import type { JurySnapshot } from '../types';

interface Props {
  snapshot: JurySnapshot | null;
}

const CX = 160;
const CY = 158;
const R = 122;
const THICKNESS = 20;

function polar(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

/** Ring segment between two angles (degrees, 180 = left, 360 = right). */
function segment(start: number, end: number): string {
  const outer = R;
  const inner = R - THICKNESS;
  const p1 = polar(start, outer);
  const p2 = polar(end, outer);
  const p3 = polar(end, inner);
  const p4 = polar(start, inner);
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

/** lean −1…+1 maps onto the 180°…360° sweep. */
function leanToAngle(lean: number): number {
  return 180 + ((Math.max(-1, Math.min(1, lean)) + 1) / 2) * 180;
}

// Diverging scale: cool pole → neutral midpoint → warm pole.
// A 1.2° gap between fills keeps the surface visible between bands.
const GAP = 1.2;
const BANDS = [
  { from: -1, to: -0.55, color: LEANING_COLORS.not_guilty, opacity: 1 },
  { from: -0.55, to: -0.2, color: LEANING_COLORS.not_guilty, opacity: 0.55 },
  { from: -0.2, to: 0.2, color: '#39404f', opacity: 1 },
  { from: 0.2, to: 0.55, color: LEANING_COLORS.guilty, opacity: 0.55 },
  { from: 0.55, to: 1, color: LEANING_COLORS.guilty, opacity: 1 },
];

export function JuryGauge({ snapshot }: Props) {
  const lean = snapshot?.juryLean ?? 0;
  const angle = leanToAngle(lean);

  const verdict =
    lean > 0.2 ? 'Leaning Guilty' : lean < -0.2 ? 'Leaning Not Guilty' : 'Split / Uncertain';
  const verdictColor =
    lean > 0.2
      ? LEANING_COLORS.guilty
      : lean < -0.2
        ? LEANING_COLORS.not_guilty
        : LEANING_COLORS.uncertain;

  const needleEnd = polar(angle, R - THICKNESS - 9);

  return (
    <div className="gauge-wrap">
      <svg width="100%" viewBox="0 0 320 180" role="img" aria-label={`Simulated jury position: ${verdict}, lean ${lean.toFixed(2)} on a scale from -1 not guilty to +1 guilty`}>
        {BANDS.map((b, i) => (
          <path
            key={i}
            d={segment(leanToAngle(b.from) + (i === 0 ? 0 : GAP / 2), leanToAngle(b.to) - (i === BANDS.length - 1 ? 0 : GAP / 2))}
            fill={b.color}
            opacity={b.opacity}
          />
        ))}

        {/* Pole labels */}
        <text x={16} y={172} fill={LEANING_COLORS.not_guilty} fontSize={10.5} fontWeight={700} letterSpacing="0.06em">
          NOT GUILTY
        </text>
        <text x={304} y={172} fill={LEANING_COLORS.guilty} fontSize={10.5} fontWeight={700} letterSpacing="0.06em" textAnchor="end">
          GUILTY
        </text>

        {/* Needle */}
        <motion.g
          animate={{ rotate: angle - 270 }}
          transition={{ type: 'spring', stiffness: 60, damping: 14 }}
          style={{ originX: `${CX}px`, originY: `${CY}px` }}
        >
          <line
            x1={CX}
            y1={CY}
            x2={CX}
            y2={CY - (R - THICKNESS - 9)}
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </motion.g>
        <circle cx={CX} cy={CY} r={9} fill="#0b0d11" stroke="#ffffff" strokeWidth={2.5} />
        <circle cx={needleEnd.x} cy={needleEnd.y} r={0} fill="none" />
      </svg>

      <div className="gauge-readout">
        <div className="gauge-verdict" style={{ color: verdictColor }}>
          {verdict}
        </div>
        <div className="gauge-sub">
          Simulated jury lean{' '}
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>
            {lean > 0 ? '+' : ''}
            {lean.toFixed(2)}
          </span>{' '}
          · round {snapshot?.round ?? 0}
        </div>
        <div className="gauge-sub" style={{ marginTop: 6, color: '#c08a6a' }}>
          AI simulation — not a verdict
        </div>
      </div>
    </div>
  );
}
