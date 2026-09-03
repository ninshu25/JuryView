import { AnimatePresence, motion } from 'framer-motion';
import { Icon, type IconName } from './Icon';
import { LEANING_COLORS } from '../theme';
import type { InfluenceEdge, Juror, JurorPosition } from '../types';

interface Props {
  jurors: Juror[];
  positions: Map<string, JurorPosition>;
  influences: InfluenceEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  round: number;
  busy: boolean;
}

/** Seat coordinates as percentages of the stage, in two gently bowed rows. */
function seatPosition(index: number): { x: number; y: number } {
  const row = index < 6 ? 0 : 1;
  const t = (index % 6) / 5;
  const bow = Math.sin(Math.PI * t) * 4;
  return { x: 13 + t * 74, y: (row === 0 ? 54 : 79) + bow };
}

/** Only the strongest pulls are drawn — every edge at once is unreadable. */
const MAX_ARCS = 8;

const PIECES: Array<{
  key: string; x: number; y: number; w: number; h: number;
  icon: IconName; caption: string; cls: string;
}> = [
  { key: 'judge', x: 50, y: 8, w: 132, h: 36, icon: 'gavel', caption: 'The Judge', cls: 'judge' },
  { key: 'witness', x: 14, y: 20, w: 78, h: 28, icon: 'witness', caption: 'Witness', cls: '' },
  { key: 'clerk', x: 86, y: 20, w: 78, h: 28, icon: 'clerk', caption: 'Clerk', cls: '' },
  { key: 'pros', x: 24, y: 32, w: 108, h: 30, icon: 'prosecution', caption: 'Prosecution', cls: 'prosecution' },
  { key: 'def', x: 50, y: 32, w: 92, h: 30, icon: 'defendant', caption: 'Defendant', cls: '' },
  { key: 'defence', x: 76, y: 32, w: 108, h: 30, icon: 'defence', caption: 'Defence', cls: 'defence' },
];

export function Courtroom({
  jurors,
  positions,
  influences,
  selectedId,
  onSelect,
  round,
  busy,
}: Props) {
  const seatOf = new Map(jurors.map((j, i) => [j.id, seatPosition(i)]));
  const shown = [...influences]
    .sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude))
    .slice(0, MAX_ARCS);
  const strongest = Math.max(0.01, ...shown.map((e) => Math.abs(e.magnitude)));

  return (
    <div className="courtroom">
      {/* Influence arcs, drawn beneath the seats. Percentage-space viewBox is
          stretched with the stage; non-scaling-stroke keeps line weight true. */}
      <svg
        className="influence-layer"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <AnimatePresence>
          {shown.map((edge) => {
            const from = seatOf.get(edge.fromJurorId);
            const to = seatOf.get(edge.toJurorId);
            if (!from || !to) return null;

            // Bow the arc perpendicular to the chord so parallel edges separate.
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.hypot(dx, dy) || 1;
            const cx = mx - (dy / len) * 6;
            const cy = my + (dx / len) * 6;

            const weight = Math.abs(edge.magnitude) / strongest;
            const color = edge.magnitude > 0 ? LEANING_COLORS.guilty : LEANING_COLORS.not_guilty;

            return (
              <motion.path
                key={`${edge.fromJurorId}-${edge.toJurorId}-${round}`}
                d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
                fill="none"
                stroke={color}
                strokeWidth={0.8 + weight * 1.6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.14 + weight * 0.3 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            );
          })}
        </AnimatePresence>
      </svg>

      {/* Fixed courtroom furniture */}
      {PIECES.map((p) => (
        <div
          key={p.key}
          className={`court-piece ${p.cls}`}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          <div className="furniture" style={{ width: p.w, height: p.h }}>
            <Icon name={p.icon} size={17} />
          </div>
          <div className="caption">{p.caption}</div>
        </div>
      ))}

      <div
        className="jury-box-frame"
        style={{ left: '7%', width: '86%', top: '44%', height: '49%' }}
      />
      <div className="jury-box-label" style={{ left: '50%', top: '44%' }}>
        Jury Box · 12 AI agents
      </div>

      {jurors.map((juror, i) => {
        const seat = seatPosition(i);
        const position = positions.get(juror.id);
        const leaning = position?.leaning ?? 'uncertain';
        const color = LEANING_COLORS[leaning];
        const confidence = position?.confidence ?? 0.2;
        const delta = position?.delta ?? 0;
        const moved = Math.abs(delta) >= 0.03;

        // Confidence ring geometry (56px box, r=25).
        const circumference = 2 * Math.PI * 25;

        return (
          <button
            type="button"
            key={juror.id}
            className={`juror-seat ${selectedId === juror.id ? 'selected' : ''}`}
            style={{ left: `${seat.x}%`, top: `${seat.y}%`, color }}
            onClick={() => onSelect(juror.id)}
            title={`${juror.name} — ${juror.archetype}`}
            aria-label={`Juror ${juror.seat}, ${juror.archetype}, currently ${leaning.replace('_', ' ')}`}
          >
            <div style={{ position: 'relative' }}>
              {/* Pulse ripple replays whenever this agent's position shifts. */}
              <AnimatePresence>
                {moved && (
                  <motion.span
                    key={`ripple-${round}`}
                    initial={{ scale: 0.9, opacity: 0.55 }}
                    animate={{ scale: 2.2, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, ease: 'easeOut', delay: i * 0.035 }}
                    style={{
                      position: 'absolute',
                      inset: -5,
                      borderRadius: '50%',
                      border: `2px solid ${color}`,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </AnimatePresence>

              <svg className="confidence-ring" width={56} height={56} aria-hidden="true">
                <circle cx={28} cy={28} r={25} fill="none" stroke="#232838" strokeWidth={3} />
                <motion.circle
                  cx={28}
                  cy={28}
                  r={25}
                  fill="none"
                  stroke={color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  animate={{ strokeDashoffset: circumference * (1 - confidence) }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  opacity={0.75}
                />
              </svg>

              <motion.div
                className="juror-avatar"
                animate={{
                  backgroundColor: `${color}2e`,
                  borderColor: color,
                  scale: moved ? [1, 1.14, 1] : 1,
                }}
                transition={{ duration: 0.65, delay: i * 0.03 }}
              >
                {juror.seat}
              </motion.div>

              {moved && (
                <span
                  className="delta-flag"
                  style={{ color, borderColor: color }}
                >
                  {delta > 0 ? '+' : ''}
                  {delta.toFixed(2)}
                </span>
              )}
            </div>
            <span className="juror-name">{juror.archetype}</span>
          </button>
        );
      })}

      {busy && (
        <div className="busy-veil">
          <div>
            <div className="spinner" />
            12 agents deliberating…
          </div>
        </div>
      )}
    </div>
  );
}
