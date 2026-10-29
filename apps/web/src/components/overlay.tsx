import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '~/lib/format';
import { IconButton } from './ui';

// ---------------------------------------------------------------------------
// Sheet: a modal panel that slides up on phones and sits centred on desktop.
// ---------------------------------------------------------------------------

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  // Callers pass a fresh onClose on every render. Read it from a ref so a
  // re-render while the sheet is open does not rerun the focus setup below
  // and pull focus out of the field the seller is typing in.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => panel.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-[#1d1f21]/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cx(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[26px] bg-paper outline-none lift-lg sm:rounded-[26px]',
              wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
            )}
            initial={{ y: 60, opacity: 0, rotate: -0.8, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
            <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
              <h2 id={titleId} className="font-display text-xl">
                {title}
              </h2>
              <IconButton label="Close" onClick={onClose}>
                <X className="size-5" aria-hidden />
              </IconButton>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="border-t border-line bg-paper px-5 py-3">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Toasts: short receipts that print from the bottom of the screen.
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(text: string, opts?: Partial<Omit<Toast, 'id' | 'text'>>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((text: string, opts: Partial<Omit<Toast, 'id' | 'text'>> = {}) => {
    const id = nextId.current++;
    setToasts(t => [...t.slice(-2), { id, text, tone: opts.tone ?? 'ok', action: opts.action }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), opts.tone === 'error' ? 7000 : 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              layout
              initial={{ y: 24, opacity: 0, scale: 0.9, rotate: -1.5 }}
              animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 460, damping: 30 }}
              style={{ originY: 1 }}
              className={cx(
                'pointer-events-auto flex max-w-md items-center gap-3 rounded-[22px] py-2.5 pl-5 text-sm font-medium lift-lg',
                t.action ? 'pr-2.5' : 'pr-5',
                t.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-paper',
              )}
              role={t.tone === 'error' ? 'alert' : 'status'}
            >
              <span>{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  className="rounded-full bg-white/15 px-3 py-1 font-semibold transition hover:bg-white/25 active:scale-95"
                  onClick={() => {
                    t.action!.run();
                    setToasts(list => list.filter(x => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
