import type { SpeakerRole, TranscriptLine } from '../types.js';

const ROLE_HINTS: Array<[RegExp, SpeakerRole]> = [
  [/\b(judge|magistrate|madam justice|mr justice|the court)\b/i, 'judge'],
  [/\b(prosecutor|prosecution|ag|attorney general)\b/i, 'prosecution'],
  [/\b(defence|defense|counsel for the accused)\b/i, 'defence'],
];

/**
 * Parses court-reporting style text into speaker lines.
 *
 *   Fenech: Lost my phone, my friend.
 *   Fenech tells the court he was using an American number.   <- narration
 *   Cini: Had you deleted WhatsApp?
 *
 * A line shaped `Speaker: words` is dialogue; anything else is treated as the
 * reporter's aside. Roles are deliberately NOT guessed from a person's name —
 * mislabelling a real individual as "the prosecution" is a factual claim the
 * parser has no basis to make. Only explicit role words in the speaker label
 * are honoured; everything else stays neutral until the caller says otherwise.
 */
export function parseTranscript(raw: string, defendantName = ''): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  const defendant = defendantName.trim().toLowerCase();

  for (const block of raw.split(/\r?\n/)) {
    const text = block.trim();
    if (!text) continue;

    // `Speaker: words` — the label must be short and free of sentence
    // punctuation, so prose containing a colon is not mistaken for dialogue.
    const match = text.match(/^([^:]{1,48}):\s*(.+)$/);
    if (!match) {
      lines.push({ speaker: '', role: 'narration', text });
      continue;
    }

    const speaker = match[1].trim();
    const said = match[2].trim();

    if (!speaker || /[.!?]$/.test(speaker) || speaker.split(/\s+/).length > 5) {
      lines.push({ speaker: '', role: 'narration', text });
      continue;
    }

    let role: SpeakerRole = 'other';
    for (const [pattern, hinted] of ROLE_HINTS) {
      if (pattern.test(speaker)) {
        role = hinted;
        break;
      }
    }
    if (role === 'other' && defendant && speaker.toLowerCase().includes(defendant)) {
      role = 'defendant';
    }

    lines.push({ speaker, role, text: said });
  }

  return lines;
}

/** Flattens a transcript back to plain text for the model prompt. */
export function transcriptToText(lines: TranscriptLine[]): string {
  return lines
    .map((l) => (l.role === 'narration' ? `[${l.text}]` : `${l.speaker}: ${l.text}`))
    .join('\n');
}
