import { Loader2, X } from 'lucide-react';
import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CUTOUTS, type CutoutId } from '~/lib/art';
import { cx } from '~/lib/format';

type Variant = 'tag' | 'ink' | 'line' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  busy?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'line', size = 'md', busy, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-10 items-center justify-center rounded-full text-ink-2 transition duration-300 ease-[var(--ease-spring)] hover:bg-paper-2 hover:text-ink active:scale-90',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx('field', className)} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx('field', className)} {...rest} />;
  },
);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('field', className)} {...rest}>
      {children}
    </select>
  );
}

/** Labelled input in one call. */
export function TextField({
  label,
  hint,
  error,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} className={className} htmlFor={id}>
      <Input id={id} {...rest} />
    </Field>
  );
}

/** Free-text values as removable chips: colours, materials, style tags. */
export function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  hint,
  suggestions = [],
  max = 12,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  hint?: ReactNode;
  suggestions?: string[];
  max?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, '');
    if (!v || values.some(x => x.toLowerCase() === v.toLowerCase()) || values.length >= max) return;
    onChange([...values, v]);
  };
  const open = suggestions.filter(s => !values.some(v => v.toLowerCase() === s.toLowerCase())).slice(0, 8);
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="field flex min-h-11 flex-wrap items-center gap-1.5 py-1.5">
        {values.map(v => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-paper-2 py-1 pr-1 pl-2.5 text-sm text-ink"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              className="rounded-full p-0.5 text-muted hover:bg-line hover:text-ink"
              onClick={() => onChange(values.filter(x => x !== v))}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={values.length ? '' : placeholder}
          className="min-w-24 flex-1 bg-transparent py-1 outline-none placeholder:text-muted"
          onChange={e => {
            const v = e.target.value;
            if (v.endsWith(',')) {
              add(v);
              setDraft('');
            } else setDraft(v);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
              setDraft('');
            } else if (e.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft) {
              add(draft);
              setDraft('');
            }
          }}
        />
      </div>
      {open.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {open.map(s => (
            <button
              key={s}
              type="button"
              className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-ink-2 transition hover:border-ink-2 hover:text-ink active:scale-95"
              onClick={() => add(s)}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}

/** One-of-many choice drawn as a row of chips. */
export function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T | null;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (v: T | null) => void;
  hint?: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-ink-2">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              title={o.title}
              aria-pressed={on}
              onClick={() => onChange(on ? null : o.value)}
              className={cx(
                'rounded-full px-3.5 py-2 text-sm font-medium transition duration-300 ease-[var(--ease-spring)] active:scale-95',
                on
                  ? 'bg-ink text-paper shadow-[0_6px_14px_-10px_rgb(0_0_0/0.6)]'
                  : 'bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--line)] hover:-translate-y-px hover:shadow-[inset_0_0_0_1.5px_var(--ink-2)]',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </fieldset>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} aria-label="Loading" />;
}

/** A sheet of receipt paper: the default container for panels. */
export function Paper({
  children,
  className,
  torn,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  torn?: boolean;
  as?: 'section' | 'div' | 'aside' | 'article';
}) {
  return (
    <Tag className={cx('relative rounded-[20px] bg-card lift', torn && 'receipt-edge rounded-b-none pb-6', className)}>
      {children}
    </Tag>
  );
}

/** The top of a page: one big, loud headline and whatever goes beside it. */
export function PageHeader({
  title,
  note,
  children,
  className,
}: {
  title: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx('flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[clamp(2.8rem,6.5vw,5rem)] leading-[0.9]">{title}</h1>
        {note && <p className="mt-2 text-ink-2">{note}</p>}
      </div>
      {children}
    </header>
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('mb-3 flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="font-display text-2xl leading-none">{children}</h2>
      </div>
      {action}
    </div>
  );
}

/** Nothing here yet: a dashed spot on the table with one garment waiting on it. */
export function Empty({
  title,
  children,
  action,
  art = 'whiteTee',
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  art?: CutoutId | null;
}) {
  const c = art ? CUTOUTS[art] : null;
  return (
    <div className="grain group relative flex items-center gap-6 overflow-hidden rounded-[20px] border-2 border-dashed border-line bg-paper p-6">
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col items-start gap-3">
        <p className="font-display text-xl">{title}</p>
        {children && <div className="max-w-prose text-ink-2">{children}</div>}
        {action}
      </div>
      {c && (
        <img
          src={c.src}
          alt=""
          aria-hidden
          className="cutout-shadow relative z-[1] hidden w-24 shrink-0 rotate-6 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-translate-y-1 group-hover:rotate-0 sm:block"
          style={{ aspectRatio: String(c.ratio) }}
        />
      )}
    </div>
  );
}

export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const message =
    typeof error === 'string' ? error : error instanceof Error ? error.message : ((error as { message?: string }).message ?? 'Something went wrong.');
  return (
    <p role="alert" className={cx('rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger', className)}>
      {message}
    </p>
  );
}
