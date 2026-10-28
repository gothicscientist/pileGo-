import { BarChart3, Layers, ScanLine, Settings, Shirt, Store } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useExtension } from '~/lib/extension';
import { cx } from '~/lib/format';
import { useJobs, useRealtime } from '~/lib/queries';

const NAV = [
  { to: '/', label: 'Pile', icon: Layers, end: true },
  { to: '/closet', label: 'Closet', icon: Shirt },
  { to: '/out', label: 'Out there', icon: Store },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function TagMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M10 4 H26 a3 3 0 0 1 3 3 V25 a3 3 0 0 1 -3 3 H10 L3 16 Z" fill="var(--tag)" />
      <circle cx="10" cy="16" r="2.6" fill="var(--paper)" />
      <path d="M14 11 H24 M14 16 H22 M14 21 H25" stroke="var(--tag-ink)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <TagMark className="size-7 -rotate-12" />
      <span className="font-display text-[1.6rem] leading-none font-extrabold tracking-tight">pileGo</span>
    </span>
  );
}

function useAttentionCount(): number {
  const { data: jobs } = useJobs();
  return (jobs ?? []).filter(j => j.status === 'needs_user' || j.status === 'failed').length;
}

function ExtensionDot() {
  const ext = useExtension();
  return (
    <NavLink
      to="/settings#extension"
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-2 hover:bg-paper-2"
      title={ext.installed ? 'The pileGo extension is connected' : 'The pileGo extension is not installed in this browser'}
    >
      <span className={cx('size-2 rounded-full', ext.installed ? 'bg-[#1fa36b]' : 'bg-line')} aria-hidden />
      {ext.installed ? (ext.running ? `Extension running ${ext.running}` : 'Extension connected') : 'No extension'}
    </NavLink>
  );
}

export function Shell() {
  useRealtime();
  const attention = useAttentionCount();
  const { pathname } = useLocation();
  const onPile = pathname === '/';

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14.5rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-paper px-4 py-5 md:flex">
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
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition',
                  isActive ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-2 hover:text-ink',
                )
              }
            >
              <Icon className="size-[1.15rem]" aria-hidden />
              <span className="flex-1">{label}</span>
              {to === '/out' && attention > 0 && (
                <span className="rounded-full bg-tag px-1.5 text-xs font-bold text-tag-ink tabular">{attention}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <ExtensionDot />
        </div>
      </aside>

      {/* Phone header */}
      <header
        className={cx(
          'sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 md:hidden',
          onPile ? 'floor' : 'border-b border-line bg-paper/95 backdrop-blur',
        )}
      >
        <NavLink to="/" aria-label="pileGo home">
          <Wordmark />
        </NavLink>
        <NavLink to="/settings" aria-label="Settings" className="rounded-full p-2 hover:bg-black/10">
          <Settings className="size-5" aria-hidden />
        </NavLink>
      </header>

      <main id="main" className="min-w-0 pb-24 md:pb-0">
        <Outlet />
      </main>

      {/* Phone tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-line bg-paper/95 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        {[NAV[0]!, NAV[1]!].map(item => (
          <TabLink key={item.to} {...item} />
        ))}
        <NavLink
          to="/scan"
          aria-label="Scan an item"
          className="relative -top-4 mx-auto flex size-16 items-center justify-center rounded-full bg-tag text-tag-ink shadow-[0_8px_20px_-6px_rgb(255_79_154/0.7)] transition active:scale-95"
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
        cx('relative flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[0.7rem] font-medium', isActive ? 'text-ink' : 'text-muted')
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cx('size-5', isActive && 'stroke-[2.4]')} aria-hidden />
          {label}
          {badge ? (
            <span className="absolute top-0.5 right-[22%] rounded-full bg-tag px-1 text-[0.6rem] font-bold text-tag-ink">{badge}</span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}
