import { BarChart3, Layers, Moon, ScanLine, Settings, Shirt, Store, Sun } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useExtension } from '~/lib/extension';
import { extensionSetupUrl } from '~/lib/extension-flow';
import { cx } from '~/lib/format';
import { useJobs, useRealtime } from '~/lib/queries';
import { useTheme } from '~/lib/theme';

const NAV = [
  { to: '/', label: 'Pile', icon: Layers, end: true },
  { to: '/closet', label: 'Closet', icon: Shirt },
  { to: '/out', label: 'Out there', icon: Store },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** A kraft hang tag on a loop of string. */
export function TagMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 2.5 C 10 2.5, 9 9, 13.5 10.5" fill="none" stroke="var(--ink-2)" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11 8 H21 L26 13 V28 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 V13 Z" fill="var(--kraft)" />
      <circle cx="16" cy="12.5" r="2" fill="var(--paper)" />
      <path d="M10.5 19.5 H21.5 M10.5 24 H18" stroke="var(--kraft-ink)" strokeWidth="1.7" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

/** pileGo! The bang is the point: loud, a little crooked, and it jumps when you touch it. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('group/mark inline-flex items-center gap-1.5', className)}>
      <TagMark className="size-7 -rotate-[10deg] transition-transform duration-500 ease-[var(--ease-spring)] group-hover/mark:-rotate-[22deg]" />
      <span className="text-[1.6rem] leading-none font-black tracking-[-0.055em] text-ink italic">
        pileGo
        <span className="inline-block origin-bottom text-tomato transition-transform duration-500 ease-[var(--ease-spring)] group-hover/mark:-translate-y-1 group-hover/mark:rotate-12">
          !
        </span>
      </span>
    </span>
  );
}

/** Sun or moon. Flips the whole app between light and dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, toggle] = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cx(
        'relative inline-flex size-10 items-center justify-center overflow-hidden rounded-full text-ink-2 transition duration-300 ease-[var(--ease-spring)] hover:bg-paper-2 hover:text-ink active:scale-90',
        className,
      )}
    >
      <motion.span
        key={theme}
        initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        className="flex"
      >
        {dark ? <Moon className="size-5" aria-hidden /> : <Sun className="size-5" aria-hidden />}
      </motion.span>
    </button>
  );
}

function useAttentionCount(): number {
  const { data: jobs } = useJobs();
  return (jobs ?? []).filter(j => j.status === 'needs_user' || j.status === 'failed').length;
}

function ExtensionDot() {
  const ext = useExtension();
  const { pathname, search, hash } = useLocation();
  const label = !ext.installed
    ? 'Get the extension'
    : ext.needs_approval
      ? 'Extension needs your OK'
      : !ext.linked
        ? 'Extension linking…'
        : ext.running
          ? `Extension running ${ext.running}`
          : 'Extension linked';
  return (
    <NavLink
      to={ext.installed ? '/settings#extension' : extensionSetupUrl(`${pathname}${search}${hash}`)}
      className="flex items-center gap-2 rounded-full px-3 py-2 text-xs text-ink-2 transition hover:bg-paper-2"
      title={ext.installed ? 'The pileGo! browser extension in this browser' : 'Install the pileGo! browser extension for Vinted, Depop and the rest'}
    >
      <span className="relative flex size-2" aria-hidden>
        {ext.running ? <span className="absolute inset-0 animate-ping rounded-full bg-olive opacity-60" /> : null}
        <span className={cx('relative size-2 rounded-full', ext.linked ? 'bg-olive' : ext.installed ? 'bg-kraft-deep' : 'bg-line')} />
      </span>
      {label}
    </NavLink>
  );
}

export function Shell() {
  useRealtime();
  const attention = useAttentionCount();
  const { pathname } = useLocation();
  const reduce = useReducedMotion();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="grain sticky top-0 hidden h-dvh flex-col gap-7 border-r border-line bg-paper px-4 py-6 md:flex">
        <NavLink to="/" className="px-2">
          <Wordmark />
        </NavLink>
        <NavLink to="/scan" className="btn btn-tag w-full justify-start text-base">
          <ScanLine className="size-5" aria-hidden />
          Scan an item
        </NavLink>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center gap-3 rounded-full px-3.5 py-2.5 font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.97]',
                  isActive ? 'text-ink' : 'text-ink-2 hover:bg-paper-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="rail-active"
                      className="absolute inset-0 -z-0 rounded-full bg-card shadow-[inset_0_0_0_1px_var(--line),0_6px_14px_-10px_rgb(var(--shadow)/0.5)]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Icon className={cx('relative size-[1.15rem] transition-transform duration-300 group-hover:-rotate-6', isActive && 'text-accent')} aria-hidden />
                  <span className="relative flex-1">{label}</span>
                  {to === '/out' && attention > 0 && (
                    <span className="relative rounded-full bg-tomato px-1.5 text-xs font-bold text-white tabular">{attention}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2">
          <ExtensionDot />
          <ThemeToggle />
        </div>
      </aside>

      {/* Phone header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-paper/90 px-4 py-2.5 backdrop-blur-md md:hidden">
        <NavLink to="/" aria-label="pileGo! home">
          <Wordmark />
        </NavLink>
        <div className="flex items-center">
          <ThemeToggle />
          <NavLink to="/settings" aria-label="Settings" className="rounded-full p-2.5 transition hover:bg-paper-2 active:scale-90">
            <Settings className="size-5" aria-hidden />
          </NavLink>
        </div>
      </header>

      <main id="main" className="min-w-0 pb-24 md:pb-0">
        {/* Each page arrives like a sheet laid down on the table. */}
        <motion.div
          key={pathname}
          initial={reduce ? false : { opacity: 0, y: 18, scale: 0.992 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 210, damping: 26, mass: 0.9 }}
          className="min-h-[inherit] origin-top"
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Phone tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-line/80 bg-paper/92 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      >
        {[NAV[0]!, NAV[1]!].map(item => (
          <TabLink key={item.to} {...item} />
        ))}
        <NavLink
          to="/scan"
          aria-label="Scan an item"
          className="relative -top-4 mx-auto flex size-16 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_10px_22px_-8px_rgb(86_112_63/0.75)] ring-4 ring-paper transition duration-300 ease-[var(--ease-spring)] active:scale-90"
        >
          <ScanLine className="size-7" aria-hidden />
        </NavLink>
        <TabLink {...NAV[2]!} badge={attention} />
        <TabLink {...NAV[3]!} />
      </nav>
    </div>
  );
}

function TabLink({ to, label, icon: Icon, end, badge }: (typeof NAV)[number] & { badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[0.7rem] font-medium transition active:scale-90',
          isActive ? 'text-ink' : 'text-muted',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cx('size-5 transition-transform duration-300', isActive && 'stroke-[2.3] text-accent -translate-y-px')} aria-hidden />
          {label}
          {isActive && <motion.span layoutId="tab-active" className="absolute -bottom-0.5 h-[3px] w-5 rounded-full bg-accent" />}
          {badge ? (
            <span className="absolute top-0.5 right-[22%] rounded-full bg-tomato px-1 text-[0.6rem] font-bold text-white">{badge}</span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

