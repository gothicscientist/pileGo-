-- Taking scan photos with a phone while the scan runs on a computer.
--
-- The computer opens a session and shows its id as a QR code. The phone is not
-- signed in: it sends photos to the phone-capture edge function with that id,
-- which files them under the owner's folder for the item being scanned and adds
-- a phone_photos row. The computer watches those rows and drops each photo into
-- the scan. The id is a random uuid and works for an hour.

create table public.phone_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The scan's item; it moves on when the seller saves and starts the next piece.
  item_id uuid not null,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  constraint phone_sessions_short check (expires_at <= created_at + interval '1 hour')
);

create index phone_sessions_expiry on public.phone_sessions (expires_at);

create table public.phone_photos (
  id uuid primary key,
  session_id uuid not null references public.phone_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null,
  path text not null,
  -- 'auto' fills the next empty slot on the computer.
  role text not null default 'auto' check (role in ('front', 'back', 'label', 'extra', 'auto')),
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index phone_photos_session on public.phone_photos (session_id, created_at);

alter table public.phone_sessions enable row level security;
alter table public.phone_photos enable row level security;

create policy "own phone sessions" on public.phone_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Only the edge function adds photos.
create policy "own phone photos read" on public.phone_photos
  for select to authenticated using (user_id = auth.uid());
create policy "own phone photos delete" on public.phone_photos
  for delete to authenticated using (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.phone_photos;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pilego-prune-phone-sessions', '41 3 * * *', $cron$ delete from public.phone_sessions where expires_at < now() - interval '1 day' $cron$);
  end if;
end $$;
