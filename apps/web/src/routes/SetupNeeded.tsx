import { Wordmark } from '~/app/Shell';

export function SetupNeeded() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-5 py-10">
      <Wordmark />
      <h1 className="font-display text-4xl font-extrabold leading-none">This copy of pileGo is not connected to a database yet.</h1>
      <p className="text-ink-2">
        Set <code className="rounded bg-paper-2 px-1">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-paper-2 px-1">VITE_SUPABASE_ANON_KEY</code> for the web app, then rebuild. Both values are
        on your Supabase project’s API settings page.
      </p>
      <p className="text-ink-2">
        The self-hosting guide in the repository’s <code className="rounded bg-paper-2 px-1">docs/self-hosting.md</code> walks
        through the whole setup, including the database, server functions and the browser extension.
      </p>
    </div>
  );
}
