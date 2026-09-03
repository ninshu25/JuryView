import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

interface PanelProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Closes the topmost overlay on Escape. */
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
}

/** Right-hand slide-over — used for a single juror's dossier. */
export function Drawer({ open, title, subtitle, onClose, children }: PanelProps) {
  useEscape(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="drawer"
            role="dialog"
            aria-label={title}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            <header className="overlay-head">
              <div>
                <h2>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                <Icon name="close" size={13} />
              </button>
            </header>
            <div className="overlay-body">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** Bottom sheet — used for the dock panels (timeline, trend, evidence…). */
export function Sheet({ open, title, subtitle, onClose, children }: PanelProps) {
  useEscape(open, onClose);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.section
            className="sheet"
            role="dialog"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          >
            <header className="overlay-head">
              <div>
                <h2>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
                <Icon name="close" size={13} />
              </button>
            </header>
            <div className="overlay-body">{children}</div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
