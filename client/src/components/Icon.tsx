/**
 * Monochrome line icons. Every glyph inherits `currentColor` and carries no
 * colour of its own, so hue in the interface is reserved for data — a juror's
 * leaning — and never spent on decoration.
 */
export type IconName =
  | 'scales'
  | 'gavel'
  | 'witness'
  | 'clerk'
  | 'prosecution'
  | 'defendant'
  | 'defence'
  | 'evidence'
  | 'testimony'
  | 'argument'
  | 'instruction'
  | 'objection'
  | 'cross-examination'
  | 'plus'
  | 'insight'
  | 'chart'
  | 'list'
  | 'close'
  | 'trials'
  | 'jurors'
  | 'sources'
  | 'reset'
  | 'lock'
  | 'chevron'
  | 'check'
  | 'external'
  | 'trash';

const PATHS: Record<IconName, JSX.Element> = {
  scales: (
    <>
      <path d="M12 4v16M7 20h10M12 6l-7 2M12 6l7 2" />
      <path d="M5 8l-2.5 5a2.6 2.6 0 0 0 5 0z" />
      <path d="M19 8l-2.5 5a2.6 2.6 0 0 0 5 0z" />
    </>
  ),
  gavel: (
    <>
      <path d="M4.5 19.5h8M13.5 3.5l7 7M17 2.5l4.5 4.5M15.5 6L11 10.5M18 8.5L13.5 13" />
      <path d="M12 8.5l-7 7a1.8 1.8 0 0 0 2.5 2.5l7-7z" />
    </>
  ),
  witness: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M6.5 20v-1.5A4.5 4.5 0 0 1 11 14h2a4.5 4.5 0 0 1 4.5 4.5V20" />
      <path d="M19 6.5c.9.9.9 3.1 0 4M21 4.5c1.8 1.8 1.8 5.2 0 7" />
    </>
  ),
  clerk: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 3.5V6h6V3.5M8.5 11h7M8.5 15h4.5" />
    </>
  ),
  prosecution: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3 12.5h18" />
    </>
  ),
  defendant: (
    <>
      <circle cx="12" cy="6.5" r="3" />
      <path d="M7 20.5v-2A4.5 4.5 0 0 1 11.5 14h1a4.5 4.5 0 0 1 4.5 4.5v2" />
    </>
  ),
  defence: (
    <>
      <path d="M12 3.5l7 2.5v6c0 4-2.9 7.2-7 8.5-4.1-1.3-7-4.5-7-8.5v-6z" />
      <path d="M9.5 12l1.8 1.8 3.4-3.6" />
    </>
  ),
  evidence: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  testimony: (
    <>
      <path d="M20 14a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
      <path d="M8.5 8.5h7M8.5 12h4" />
    </>
  ),
  argument: (
    <>
      <path d="M16.5 12.5a2 2 0 0 1-2 2H8l-3.5 3V5.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
      <path d="M19.5 8.5h.5a2 2 0 0 1 2 2v9l-3-2.5" />
    </>
  ),
  instruction: (
    <>
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
    </>
  ),
  objection: (
    <>
      <path d="M9 11V5.2a1.6 1.6 0 0 1 3.2 0V11" />
      <path d="M12.2 10.4V4.6a1.6 1.6 0 0 1 3.2 0V12" />
      <path d="M15.4 8.6a1.6 1.6 0 0 1 3.2 0V14a6.5 6.5 0 0 1-6.5 6.5h-1A5.6 5.6 0 0 1 5.5 15l-.6-2a1.6 1.6 0 0 1 2.9-1.3l1.2 2.4" />
    </>
  ),
  'cross-examination': (
    <>
      <path d="M4 8h11M11.5 4.5L15 8l-3.5 3.5" />
      <path d="M20 16H9M12.5 12.5L9 16l3.5 3.5" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  insight: (
    <>
      <path d="M9.5 18.5h5M10 21h4" />
      <path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-1 1.2-1.1 2h-5c-.1-.8-.5-1.5-1.1-2A6 6 0 0 1 12 3z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M7.5 15l3.5-4.5 3 2.5L20 7" />
    </>
  ),
  list: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trials: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9h17M8 4.5v4.5M8 13.5h8" />
    </>
  ),
  jurors: (
    <>
      <circle cx="8.5" cy="8" r="2.8" />
      <path d="M3.5 19v-1.4A3.6 3.6 0 0 1 7 14h3a3.6 3.6 0 0 1 3.5 3.6V19" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M15 14h1.5a4 4 0 0 1 4 4v1" />
    </>
  ),
  sources: (
    <>
      <path d="M5 4.5h9l5 5v10a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19.5v-13A1.5 1.5 0 0 1 5.5 5z" />
      <path d="M13.5 4.5V10H19M8 13.5h8M8 17h5" />
    </>
  ),
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.6-5.9" />
      <path d="M4 4v4h4" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  chevron: <path d="M9 5.5l6.5 6.5L9 18.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  external: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19 5l-8 8M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V7.5A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.5 6.5l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3l.9-12.2M10 10.5v6M14 10.5v6" />
    </>
  ),
};

interface Props {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.6, className, title }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
