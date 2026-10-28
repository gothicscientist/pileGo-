-- pileGo schema: closet items, photos, marketplace listings, a job queue shared
-- by the server and the browser extension, and an event log for analytics.
-- Every user-owned row carries user_id and is guarded by row-level security.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- True when the caller is the server (service role key), not a signed-in user.
-- Reads the role PostgREST sets; SECURITY DEFINER does not change it.
create or replace function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    current_setting('role', true)
  ) = 'service_role'
$$;

-- Which side runs work for a marketplace. eBay has an official API the server
-- calls; the rest run in the seller's browser through the extension.
create or replace function public.runner_for(p_marketplace text) returns text
language sql immutable as $$
  select case when p_marketplace = 'ebay' then 'server' else 'extension' end
$$;

-- Marketplaces with no automation at all: the seller uses the listing kit.
create or replace function public.is_manual_marketplace(p_marketplace text) returns boolean
language sql immutable as $$
  select p_marketplace in ('etsy', 'vestiaire')
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  currency text not null default 'USD' check (char_length(currency) = 3),
  region text not null default 'US' check (region in ('US', 'UK', 'EU', 'AU', 'CA')),
  measurement_unit text not null default 'in' check (measurement_unit in ('cm', 'in')),
  voice jsonb not null default '{"tone":"friendly","sign_off":null,"always_mention":[],"avoid_words":[]}'::jsonb,
  fee_overrides jsonb not null default '{}'::jsonb,
  marketplaces text[] not null default array['ebay', 'vinted', 'depop', 'poshmark'],
  price_strategy text not null default 'same' check (price_strategy in ('same', 'match_take_home')),
  stale_after_days int not null default 30 check (stale_after_days between 7 and 365),
  extension_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sku text not null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'listed', 'sold', 'shipped', 'archived')),
  title text not null default '',
  brand text,
  department text check (department in ('women', 'men', 'kids', 'unisex')),
  category text,
  subcategory text,
  size text,
  size_system text,
  colors text[] not null default '{}',
  materials text[] not null default '{}',
  condition text check (condition in ('new_with_tags', 'new_without_tags', 'excellent', 'good', 'fair')),
  flaws text,
  measurements jsonb,
  style_tags text[] not null default '{}',
  era text,
  description text not null default '',
  price numeric(10, 2) check (price is null or price >= 0),
  original_price numeric(10, 2) check (original_price is null or original_price >= 0),
  cost numeric(10, 2) check (cost is null or cost >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  location text,
  notes text,
  ai jsonb,
  price_suggestion jsonb,
  sold_at timestamptz,
  sold_price numeric(10, 2),
  sold_marketplace text,
  search tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(sku, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(size, '') || ' ' || coalesce(era, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sku)
);

create index items_user_status on public.items (user_id, status, updated_at desc);
create index items_search on public.items using gin (search);

create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();

create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  path text not null,
  cutout_path text,
  position int not null default 0,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index item_photos_item on public.item_photos (item_id, position);

-- ---------------------------------------------------------------------------
-- Marketplace listings: one row per item per marketplace
-- ---------------------------------------------------------------------------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  marketplace text not null,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'publishing', 'listed', 'needs_action', 'failed', 'delisting', 'delisted', 'sold')),
  external_id text,
  external_url text,
  title text,
  price numeric(10, 2),
  payload jsonb not null default '{}'::jsonb,
  error text,
  listed_at timestamptz,
  last_synced_at timestamptz,
  relist_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, marketplace)
);

create index listings_user_market on public.listings (user_id, marketplace, status);
create unique index listings_external on public.listings (user_id, marketplace, external_id)
  where external_id is not null;

create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Jobs: work for the server (eBay) or the extension (everything else)
-- ---------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('publish', 'delist', 'relist', 'import', 'sync', 'update_price')),
  runner text not null check (runner in ('server', 'extension')),
  marketplace text not null,
  item_id uuid references public.items (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed', 'needs_user', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_pending on public.jobs (runner, status, run_after) where status = 'pending';
create index jobs_user on public.jobs (user_id, created_at desc);

create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Events: the history analytics is built from
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  marketplace text,
  type text not null check (type in ('created', 'listed', 'price_changed', 'relisted', 'delisted', 'sold', 'shipped')),
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create index events_user_at on public.events (user_id, at desc);
create index events_item on public.events (item_id, at desc);

-- ---------------------------------------------------------------------------
-- Marketplace connections. Tokens live in a separate table that only the
-- server can read; the browser sees connection status, never secrets.
-- ---------------------------------------------------------------------------

create table public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marketplace text not null,
  status text not null default 'connected' check (status in ('connected', 'expired', 'error', 'disconnected')),
  username text,
  meta jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, marketplace)
);

create trigger marketplace_accounts_updated_at before update on public.marketplace_accounts
  for each row execute function public.set_updated_at();

create table public.marketplace_secrets (
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace text not null,
  access_token text,
  refresh_token text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  scopes text[],
  updated_at timestamptz not null default now(),
  primary key (user_id, marketplace)
);

-- Ids learned from a marketplace, such as Vinted brand and catalog ids, so the
-- next listing can be built without asking again.
create table public.marketplace_mappings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marketplace text not null,
  kind text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, marketplace, kind, key)
);

-- Cached comparable listings for pricing.
create table public.price_comps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  source text not null,
  comps jsonb not null default '[]'::jsonb,
  query text,
  fetched_at timestamptz not null default now()
);

create index price_comps_item on public.price_comps (item_id, fetched_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.item_photos enable row level security;
alter table public.listings enable row level security;
alter table public.jobs enable row level security;
alter table public.events enable row level security;
alter table public.marketplace_accounts enable row level security;
alter table public.marketplace_secrets enable row level security;
alter table public.marketplace_mappings enable row level security;
alter table public.price_comps enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "own items" on public.items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own photos" on public.item_photos
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.items i where i.id = item_id and i.user_id = auth.uid()));

create policy "own listings" on public.listings
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.items i where i.id = item_id and i.user_id = auth.uid()));

create policy "own jobs" on public.jobs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own events read" on public.events
  for select to authenticated using (user_id = auth.uid());
create policy "own events write" on public.events
  for insert to authenticated with check (user_id = auth.uid());

create policy "own accounts read" on public.marketplace_accounts
  for select to authenticated using (user_id = auth.uid());
-- Extension marketplaces are "connected" by the extension itself.
create policy "own accounts write" on public.marketplace_accounts
  for all to authenticated using (user_id = auth.uid() and marketplace <> 'ebay')
  with check (user_id = auth.uid() and marketplace <> 'ebay');

-- marketplace_secrets: no policies, so only the service role can touch it.

create policy "own mappings" on public.marketplace_mappings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own comps" on public.price_comps
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Event triggers
-- ---------------------------------------------------------------------------

create or replace function public.item_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.events (user_id, item_id, type, data)
    values (new.user_id, new.id, 'created', jsonb_build_object('price', new.price));
  elsif new.price is distinct from old.price and old.price is not null then
    insert into public.events (user_id, item_id, type, data)
    values (new.user_id, new.id, 'price_changed', jsonb_build_object('from', old.price, 'to', new.price));
  end if;
  if tg_op = 'UPDATE' and new.status = 'shipped' and old.status is distinct from 'shipped' then
    insert into public.events (user_id, item_id, marketplace, type)
    values (new.user_id, new.id, new.sold_marketplace, 'shipped');
  end if;
  return new;
end $$;

create trigger items_events after insert or update on public.items
  for each row execute function public.item_events();

create or replace function public.listing_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'listed' and (tg_op = 'INSERT' or old.status is distinct from 'listed') then
    insert into public.events (user_id, item_id, listing_id, marketplace, type, data)
    values (new.user_id, new.item_id, new.id, new.marketplace,
      case when tg_op = 'UPDATE' and new.relist_count > old.relist_count then 'relisted' else 'listed' end,
      jsonb_build_object('price', new.price, 'url', new.external_url));
    -- An item listed anywhere counts as listed.
    update public.items set status = 'listed'
      where id = new.item_id and status in ('draft', 'ready');
  elsif tg_op = 'UPDATE' and new.status = 'delisted' and old.status is distinct from 'delisted' then
    insert into public.events (user_id, item_id, listing_id, marketplace, type)
    values (new.user_id, new.item_id, new.id, new.marketplace, 'delisted');
    -- Nothing left listed and not sold: back to ready.
    update public.items i set status = 'ready'
      where i.id = new.item_id and i.status = 'listed'
        and not exists (select 1 from public.listings l where l.item_id = i.id and l.status in ('listed', 'publishing', 'queued'));
  end if;
  return new;
end $$;

create or replace function public.listing_defaults() returns trigger
language plpgsql as $$
begin
  if new.status = 'listed' and new.listed_at is null then
    new.listed_at := now();
  end if;
  return new;
end $$;

create trigger listings_defaults before insert or update of status on public.listings
  for each row execute function public.listing_defaults();

create trigger listings_events after insert or update of status on public.listings
  for each row execute function public.listing_events();

-- ---------------------------------------------------------------------------
-- RPC: queue publishing an item to marketplaces
-- ---------------------------------------------------------------------------

create or replace function public.queue_publish(p_item_id uuid, p_marketplaces text[], p_overrides jsonb default '{}'::jsonb)
returns setof public.listings
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_item public.items;
  v_market text;
  v_listing public.listings;
begin
  select * into v_item from public.items where id = p_item_id;
  if v_item.id is null or v_item.user_id is distinct from v_user then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  if v_item.status in ('sold', 'shipped') then
    raise exception 'This item is already sold' using errcode = 'P0001';
  end if;

  foreach v_market in array p_marketplaces loop
    insert into public.listings (user_id, item_id, marketplace, status, title, price, payload)
    values (v_user, p_item_id, v_market,
      case when public.is_manual_marketplace(v_market) then 'draft' else 'queued' end,
      p_overrides -> v_market ->> 'title',
      coalesce((p_overrides -> v_market ->> 'price')::numeric, v_item.price),
      coalesce(p_overrides -> v_market, '{}'::jsonb))
    on conflict (item_id, marketplace) do update
      set status = case
            when public.listings.status in ('listed', 'publishing') then public.listings.status
            when public.is_manual_marketplace(excluded.marketplace) then 'draft'
            else 'queued' end,
          title = coalesce(excluded.title, public.listings.title),
          price = excluded.price,
          payload = public.listings.payload || excluded.payload,
          error = null
    returning * into v_listing;

    if v_listing.status = 'queued' then
      update public.jobs set status = 'cancelled'
        where listing_id = v_listing.id and status = 'pending';
      insert into public.jobs (user_id, kind, runner, marketplace, item_id, listing_id, payload)
      values (v_user, 'publish', public.runner_for(v_market), v_market, p_item_id, v_listing.id,
              coalesce(p_overrides -> v_market, '{}'::jsonb));
    end if;
    return next v_listing;
  end loop;

  update public.items set status = 'ready' where id = p_item_id and status = 'draft';
end $$;

-- ---------------------------------------------------------------------------
-- RPC: queue a delist or relist
-- ---------------------------------------------------------------------------

create or replace function public.queue_listing_job(p_listing_id uuid, p_kind text, p_payload jsonb default '{}'::jsonb)
returns public.jobs
language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings;
  v_job public.jobs;
begin
  if p_kind not in ('delist', 'relist', 'update_price') then
    raise exception 'Unsupported job kind %', p_kind;
  end if;
  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null or v_listing.user_id is distinct from auth.uid() then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  update public.jobs set status = 'cancelled'
    where listing_id = p_listing_id and status = 'pending' and kind = p_kind;
  if p_kind = 'delist' then
    update public.listings set status = 'delisting' where id = p_listing_id and status <> 'sold';
  end if;
  insert into public.jobs (user_id, kind, runner, marketplace, item_id, listing_id, payload)
  values (v_listing.user_id, p_kind, public.runner_for(v_listing.marketplace), v_listing.marketplace,
          v_listing.item_id, v_listing.id, p_payload)
  returning * into v_job;
  return v_job;
end $$;

-- After a sale, stop everything else: queued listings go back to draft,
-- listings pileGo can end get a delist job, the rest are flagged for the seller.
create or replace function public.take_down_others(v_item public.items, p_except uuid, p_sold_on text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_other public.listings;
begin
  update public.jobs set status = 'cancelled', error = 'Item sold'
    where item_id = v_item.id and kind in ('publish', 'relist', 'update_price') and status in ('pending', 'needs_user');

  for v_other in
    select * from public.listings
    where item_id = v_item.id and id is distinct from p_except
      and status in ('listed', 'publishing', 'needs_action', 'queued')
  loop
    if v_other.status = 'queued' then
      update public.listings set status = 'draft' where id = v_other.id;
    elsif public.is_manual_marketplace(v_other.marketplace) or v_other.marketplace = 'facebook' then
      update public.listings set status = 'needs_action', error = 'Sold elsewhere. Remove this listing by hand.'
        where id = v_other.id;
    else
      update public.listings set status = 'delisting' where id = v_other.id;
      insert into public.jobs (user_id, kind, runner, marketplace, item_id, listing_id, payload)
      values (v_item.user_id, 'delist', public.runner_for(v_other.marketplace), v_other.marketplace,
              v_item.id, v_other.id, jsonb_build_object('reason', 'sold_elsewhere', 'sold_on', coalesce(p_sold_on, 'elsewhere')));
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: record a sale. Marks the item and listing sold and queues delists on
-- every other marketplace the item is live on. Called by the extension (as the
-- seller), by the eBay sync (as the service role), or by hand from the app.
-- ---------------------------------------------------------------------------

create or replace function public.record_sale(
  p_listing_id uuid,
  p_price numeric default null,
  p_sold_at timestamptz default now(),
  p_data jsonb default '{}'::jsonb
) returns public.items
language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings;
  v_item public.items;
begin
  select * into v_listing from public.listings where id = p_listing_id for update;
  if v_listing.id is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  if v_listing.user_id is distinct from auth.uid() and not public.is_service_role() then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  select * into v_item from public.items where id = v_listing.item_id for update;
  if v_item.status in ('sold', 'shipped') and v_item.sold_marketplace is distinct from v_listing.marketplace then
    -- Sold twice: record it so the seller sees the clash, but keep the first sale.
    update public.listings set status = 'needs_action',
      error = 'Sold here too, after it sold on ' || coalesce(v_item.sold_marketplace, 'another marketplace') || '. Cancel one of the orders.'
      where id = v_listing.id;
    return v_item;
  end if;

  update public.listings set status = 'sold', last_synced_at = now(), error = null where id = v_listing.id;

  update public.items set
    status = 'sold',
    sold_at = coalesce(v_item.sold_at, p_sold_at),
    sold_price = coalesce(p_price, v_listing.price, v_item.price),
    sold_marketplace = v_listing.marketplace
  where id = v_item.id
  returning * into v_item;

  insert into public.events (user_id, item_id, listing_id, marketplace, type, data)
  values (v_item.user_id, v_item.id, v_listing.id, v_listing.marketplace, 'sold',
          jsonb_build_object('price', v_item.sold_price) || coalesce(p_data, '{}'::jsonb));

  perform public.take_down_others(v_item, v_listing.id, v_listing.marketplace);

  return v_item;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: the item sold somewhere pileGo does not list (in person, a fair, a DM).
-- ---------------------------------------------------------------------------

create or replace function public.record_offline_sale(p_item_id uuid, p_price numeric default null, p_sold_at timestamptz default now())
returns public.items
language plpgsql security definer set search_path = public as $$
declare
  v_item public.items;
begin
  select * into v_item from public.items where id = p_item_id for update;
  if v_item.id is null or v_item.user_id is distinct from auth.uid() then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  if v_item.status in ('sold', 'shipped') then
    return v_item;
  end if;
  update public.items set status = 'sold', sold_at = p_sold_at, sold_price = coalesce(p_price, v_item.price),
    sold_marketplace = null
    where id = p_item_id
    returning * into v_item;
  insert into public.events (user_id, item_id, type, data)
  values (v_item.user_id, v_item.id, 'sold', jsonb_build_object('price', v_item.sold_price, 'offline', true));
  perform public.take_down_others(v_item, null, null);
  return v_item;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: the extension claims its jobs. SKIP LOCKED keeps two browsers from
-- running the same job.
-- ---------------------------------------------------------------------------

create or replace function public.claim_jobs(p_runner text, p_marketplaces text[] default null, p_limit int default 5)
returns setof public.jobs
language plpgsql security definer set search_path = public as $$
declare
begin
  if auth.uid() is null and not public.is_service_role() then
    raise exception 'Sign in first';
  end if;

  -- Jobs stuck in running for ten minutes were abandoned (tab closed).
  update public.jobs set status = 'pending', run_after = now()
    where status = 'running' and claimed_at < now() - interval '10 minutes'
      and runner = p_runner and (auth.uid() is null or user_id = auth.uid());

  return query
  update public.jobs j set status = 'running', claimed_at = now(), attempts = j.attempts + 1
  where j.id in (
    select id from public.jobs
    where status = 'pending' and runner = p_runner and run_after <= now()
      and (auth.uid() is null or user_id = auth.uid())
      and (p_marketplaces is null or marketplace = any (p_marketplaces))
    order by run_after, created_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning j.*;
end $$;

create or replace function public.finish_job(
  p_job_id uuid,
  p_status text,
  p_result jsonb default null,
  p_error text default null,
  p_retry_in_seconds int default null
) returns public.jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs;
begin
  if p_status not in ('done', 'failed', 'needs_user', 'pending', 'cancelled') then
    raise exception 'Unsupported status %', p_status;
  end if;
  update public.jobs set
    status = p_status,
    result = coalesce(p_result, result),
    error = p_error,
    run_after = case when p_retry_in_seconds is not null then now() + make_interval(secs => p_retry_in_seconds) else run_after end
  where id = p_job_id and (user_id = auth.uid() or public.is_service_role())
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  return v_job;
end $$;

revoke all on function public.record_sale(uuid, numeric, timestamptz, jsonb) from public, anon;
revoke all on function public.record_offline_sale(uuid, numeric, timestamptz) from public, anon;
revoke all on function public.take_down_others(public.items, uuid, text) from public, anon, authenticated;
revoke all on function public.queue_publish(uuid, text[], jsonb) from public, anon;
revoke all on function public.queue_listing_job(uuid, text, jsonb) from public, anon;
revoke all on function public.claim_jobs(text, text[], int) from public, anon;
revoke all on function public.finish_job(uuid, text, jsonb, text, int) from public, anon;
grant execute on function public.record_sale(uuid, numeric, timestamptz, jsonb) to authenticated, service_role;
grant execute on function public.record_offline_sale(uuid, numeric, timestamptz) to authenticated;
grant execute on function public.queue_publish(uuid, text[], jsonb) to authenticated, service_role;
grant execute on function public.queue_listing_job(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.claim_jobs(text, text[], int) to authenticated, service_role;
grant execute on function public.finish_job(uuid, text, jsonb, text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket, each user writes under their own id.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "own photo files read" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photo files insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photo files update" on storage.objects
  for update to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photo files delete" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
