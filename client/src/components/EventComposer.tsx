import { useState } from 'react';
import { Icon } from './Icon';
import type { EventKind, Side, SuggestedEvent } from '../types';

interface Props {
  suggestions: SuggestedEvent[];
  usedTitles: Set<string>;
  busy: boolean;
  onSubmit: (event: SuggestedEvent) => void;
  onDeliberate: () => void;
  onReset: () => void;
}

const KINDS: EventKind[] = [
  'evidence',
  'testimony',
  'argument',
  'instruction',
  'objection',
  'cross_examination',
];
const SIDES: Side[] = ['prosecution', 'defence', 'neutral'];

const EMPTY: SuggestedEvent = {
  kind: 'evidence',
  side: 'prosecution',
  title: '',
  content: '',
  strength: 0.6,
  emotional: 0.3,
  authority: 0.4,
};

// Neutral placeholder — a real participant's name should not sit in the UI
// chrome as though it were sample data.
const PLACEHOLDER = `Counsel returns to a message thread recovered from a third party.

Counsel: You told this court the phone was replaced on the Monday.
Witness: That is right.
Counsel: And there is no message history before that Monday?
Witness: I do not remember.`;

export function EventComposer({
  suggestions,
  usedTitles,
  busy,
  onSubmit,
  onDeliberate,
  onReset,
}: Props) {
  const [tab, setTab] = useState<'preset' | 'transcript' | 'custom'>('transcript');
  const [draft, setDraft] = useState<SuggestedEvent>(EMPTY);
  const [transcriptText, setTranscriptText] = useState('');

  const submitCustom = () => {
    if (!draft.title.trim()) return;
    onSubmit(draft);
    setDraft(EMPTY);
  };

  const submitTranscript = () => {
    if (!draft.title.trim() || !transcriptText.trim()) return;
    onSubmit({ ...draft, transcriptText });
    setDraft(EMPTY);
    setTranscriptText('');
  };

  const lineCount = transcriptText.split('\n').filter((l) => l.trim()).length;

  return (
    <div className="composer">
      <div className="tabs">
        {(
          [
            ['transcript', 'Paste transcript'],
            ['custom', 'Describe'],
            ['preset', 'Presets'],
          ] as Array<[typeof tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'transcript' && (
        <>
          <div className="field">
            <label htmlFor="tr-title">What this exchange is about</label>
            <input
              id="tr-title"
              type="text"
              value={draft.title}
              placeholder="e.g. Cross-examination on the deleted messages"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="tr-body">
              Court transcript — one <code>Speaker: words</code> per line
            </label>
            <textarea
              id="tr-body"
              rows={11}
              className="mono-input"
              value={transcriptText}
              placeholder={PLACEHOLDER}
              onChange={(e) => setTranscriptText(e.target.value)}
            />
            <span className="field-hint">
              Lines without a <code>Speaker:</code> prefix are kept as the reporter's asides.
              {lineCount > 0 && ` · ${lineCount} lines`}
            </span>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="tr-kind">Kind</label>
              <select
                id="tr-kind"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as EventKind })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tr-side">Led by</label>
              <select
                id="tr-side"
                value={draft.side}
                onChange={(e) => setDraft({ ...draft, side: e.target.value as Side })}
              >
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            className="btn primary"
            disabled={busy || !draft.title.trim() || !transcriptText.trim()}
            onClick={submitTranscript}
          >
            Put this to the jury
          </button>
        </>
      )}

      {tab === 'custom' && (
        <>
          <div className="field">
            <label htmlFor="ev-title">Title</label>
            <input
              id="ev-title"
              type="text"
              value={draft.title}
              placeholder="e.g. Forensic report on the accelerant"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="ev-content">What is presented to the jury</label>
            <textarea
              id="ev-content"
              rows={5}
              value={draft.content}
              placeholder="Describe the evidence, testimony or argument the agents should evaluate…"
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="ev-kind">Kind</label>
              <select
                id="ev-kind"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as EventKind })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ev-side">Offered by</label>
              <select
                id="ev-side"
                value={draft.side}
                onChange={(e) => setDraft({ ...draft, side: e.target.value as Side })}
              >
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(
            [
              ['strength', 'Probative force'],
              ['emotional', 'Emotional charge'],
              ['authority', 'Authority weight'],
            ] as Array<['strength' | 'emotional' | 'authority', string]>
          ).map(([key, label]) => (
            <div className="slider-row" key={key}>
              <span>{label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
              />
              <span className="num">{draft[key].toFixed(2)}</span>
            </div>
          ))}

          <button
            type="button"
            className="btn primary"
            disabled={busy || !draft.title.trim()}
            onClick={submitCustom}
          >
            Present to the jury
          </button>
        </>
      )}

      {tab === 'preset' && (
        <div className="suggestion-list">
          {suggestions.map((s) => {
            const used = usedTitles.has(s.title);
            return (
              <button
                type="button"
                key={s.title}
                className="suggestion"
                disabled={busy || used}
                onClick={() => onSubmit(s)}
                style={used ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              >
                <span
                  className="suggestion-rail"
                  style={{
                    background:
                      s.side === 'prosecution'
                        ? 'var(--guilty)'
                        : s.side === 'defence'
                          ? 'var(--not-guilty)'
                          : '#8b93a5',
                  }}
                />
                <span style={{ minWidth: 0 }}>
                  <span className="s-title">{s.title}</span>
                  <span className="s-meta">
                    {s.kind.replace('_', ' ')} · {s.side}
                    {s.transcriptText ? ' · transcript' : ''}
                    {used ? ' · presented' : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="btn-row">
        <button type="button" className="btn" disabled={busy} onClick={onDeliberate}>
          <Icon name="argument" size={14} /> Deliberate only
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onReset}>
          <Icon name="reset" size={14} /> Reset trial
        </button>
      </div>
    </div>
  );
}
