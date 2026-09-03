import type { TranscriptLine } from '../types';

/**
 * Renders a court exchange. Speakers get a stable colour by order of first
 * appearance rather than by guessed role — the parser deliberately does not
 * assert that a named person is "the prosecution", so neither does this.
 */
const SPEAKER_COLORS = ['#e0b539', '#5aa9e6', '#7ec9a5', '#d98cae', '#b0a6f0'];

export function TranscriptView({ lines }: { lines: TranscriptLine[] }) {
  if (!lines?.length) return null;

  const order: string[] = [];
  for (const l of lines) {
    if (l.role !== 'narration' && l.speaker && !order.includes(l.speaker)) {
      order.push(l.speaker);
    }
  }

  return (
    <div className="transcript">
      {lines.map((line, i) => {
        if (line.role === 'narration') {
          return (
            <p key={i} className="tr-narration">
              {line.text}
            </p>
          );
        }
        const color = SPEAKER_COLORS[order.indexOf(line.speaker) % SPEAKER_COLORS.length];
        const isQuestion = line.text.trim().endsWith('?');
        return (
          <p key={i} className={`tr-line ${isQuestion ? 'question' : ''}`}>
            <span className="tr-speaker" style={{ color }}>
              {line.speaker}
            </span>
            <span className="tr-text">{line.text}</span>
          </p>
        );
      })}
    </div>
  );
}
