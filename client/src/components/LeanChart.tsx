import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { INK, LEANING_COLORS } from '../theme';
import type { JurySnapshot, TrialEvent } from '../types';

interface Props {
  snapshots: JurySnapshot[];
  events: TrialEvent[];
}

type View = 'blocs' | 'lean' | 'table';

const SERIES = [
  { key: 'guilty', label: 'Guilty', color: LEANING_COLORS.guilty },
  { key: 'notGuilty', label: 'Not guilty', color: LEANING_COLORS.not_guilty },
  { key: 'uncertain', label: 'Uncertain', color: LEANING_COLORS.uncertain },
] as const;

export function LeanChart({ snapshots, events }: Props) {
  const [view, setView] = useState<View>('blocs');

  const eventByRound = new Map(events.map((e) => [e.round, e]));
  const data = snapshots.map((s) => ({
    round: s.round,
    guilty: s.guiltyPct,
    notGuilty: s.notGuiltyPct,
    uncertain: s.uncertainPct,
    lean: s.juryLean,
    confidence: Math.round(s.confidence * 100),
    eventTitle: eventByRound.get(s.round)?.title ?? (s.round === 0 ? 'Before any evidence' : ''),
  }));

  const lastIndex = data.length - 1;

  /** Labels only the final point of each series — never a number on every point. */
  const endLabel =
    (color: string, suffix: string) =>
    (props: any) => {
      const { cx, cy, index, value, key } = props;
      if (index !== lastIndex || cx == null) return <g key={key} />;
      return (
        <g key={key}>
          <circle cx={cx} cy={cy} r={4} fill={color} stroke={INK.surface} strokeWidth={2} />
          <text
            x={cx + 8}
            y={cy + 4}
            fill={color}
            fontSize={11}
            fontWeight={700}
            fontFamily="var(--mono)"
          >
            {typeof value === 'number' ? value.toFixed(suffix === '%' ? 0 : 2) : ''}
            {suffix}
          </text>
        </g>
      );
    };

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {(
          [
            ['blocs', 'Bloc split'],
            ['lean', 'Jury lean'],
            ['table', 'Table'],
          ] as Array<[View, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab ${view === key ? 'active' : ''}`}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'blocs' && (
        <>
          <div className="chart-legend">
            {SERIES.map((s) => (
              <span key={s.key} className="legend-item">
                <span className="legend-swatch" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={data} margin={{ top: 8, right: 44, bottom: 4, left: -14 }}>
              <CartesianGrid stroke={INK.grid} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="round"
                stroke={INK.axis}
                tick={{ fill: INK.muted, fontSize: 11 }}
                tickLine={false}
                label={{
                  value: 'trial round',
                  position: 'insideBottomRight',
                  offset: -2,
                  fill: INK.muted,
                  fontSize: 10,
                }}
              />
              <YAxis
                domain={[0, 100]}
                stroke={INK.axis}
                tick={{ fill: INK.muted, fontSize: 11 }}
                tickLine={false}
                unit="%"
              />
              <Tooltip content={<VizTooltip mode="blocs" />} cursor={{ stroke: INK.axis, strokeWidth: 1 }} />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={endLabel(s.color, '%')}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
                  isAnimationActive
                  animationDuration={600}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {view === 'lean' && (
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={data} margin={{ top: 8, right: 48, bottom: 4, left: -14 }}>
            <CartesianGrid stroke={INK.grid} strokeDasharray="2 4" vertical={false} />
            {/* Faint polarity bands so the sign of the lean reads instantly. */}
            <ReferenceArea y1={0.2} y2={1} fill={LEANING_COLORS.guilty} fillOpacity={0.07} />
            <ReferenceArea y1={-1} y2={-0.2} fill={LEANING_COLORS.not_guilty} fillOpacity={0.07} />
            <XAxis
              dataKey="round"
              stroke={INK.axis}
              tick={{ fill: INK.muted, fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              domain={[-1, 1]}
              ticks={[-1, -0.5, 0, 0.5, 1]}
              stroke={INK.axis}
              tick={{ fill: INK.muted, fontSize: 11 }}
              tickLine={false}
            />
            <ReferenceLine y={0} stroke={INK.axis} strokeWidth={1} />
            <Tooltip content={<VizTooltip mode="lean" />} cursor={{ stroke: INK.axis, strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="lean"
              name="Jury lean"
              stroke="#e6cd7d"
              strokeWidth={2}
              dot={endLabel('#e6cd7d', '')}
              activeDot={{ r: 5, strokeWidth: 2, stroke: INK.surface }}
              animationDuration={600}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {view === 'table' && (
        <div style={{ maxHeight: 240, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: INK.muted }}>
                {['Round', 'Event', 'Guilty', 'Not guilty', 'Uncertain', 'Lean'].map((h) => (
                  <th key={h} style={{ padding: '7px 8px', borderBottom: `1px solid ${INK.grid}`, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
              {data.map((d) => (
                <tr key={d.round}>
                  <td style={cell}>{d.round}</td>
                  <td style={{ ...cell, color: INK.secondary, maxWidth: 200 }}>{d.eventTitle}</td>
                  <td style={{ ...cell, color: LEANING_COLORS.guilty }}>{Math.round(d.guilty)}%</td>
                  <td style={{ ...cell, color: LEANING_COLORS.not_guilty }}>{Math.round(d.notGuilty)}%</td>
                  <td style={{ ...cell, color: LEANING_COLORS.uncertain }}>{Math.round(d.uncertain)}%</td>
                  <td style={cell}>{d.lean.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cell: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
};

function VizTooltip({ active, payload, mode }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <div className="viz-tooltip">
      <div className="tt-title">Round {row.round}</div>
      {mode === 'blocs' ? (
        SERIES.map((s) => (
          <div className="tt-row" key={s.key}>
            <span style={{ color: s.color }}>{s.label}</span>
            <span>{Math.round(row[s.key])}%</span>
          </div>
        ))
      ) : (
        <>
          <div className="tt-row">
            <span style={{ color: 'var(--ink-2)' }}>Jury lean</span>
            <span>{row.lean.toFixed(2)}</span>
          </div>
          <div className="tt-row">
            <span style={{ color: 'var(--ink-2)' }}>Confidence</span>
            <span>{row.confidence}%</span>
          </div>
        </>
      )}
      {row.eventTitle && <div className="tt-event">{row.eventTitle}</div>}
    </div>
  );
}
