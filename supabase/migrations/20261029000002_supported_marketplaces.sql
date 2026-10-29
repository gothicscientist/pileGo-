-- Retire unsupported marketplaces without deleting listing or sales history.
create or replace function public.is_supported_marketplace(p_marketplace text) returns boolean
language sql immutable as $$
  select coalesce(p_marketplace in ('ebay', 'vinted', 'depop', 'poshmark', 'mercari', 'grailed'), false)
$$;

-- Existing unsupported listings still need the seller to take them down after
-- a sale elsewhere; do not enqueue extension jobs for those historical rows.
create or replace function public.is_manual_marketplace(p_marketplace text) returns boolean
language sql immutable as $$
  select not public.is_supported_marketplace(p_marketplace)
$$;

create or replace function public.require_supported_marketplace() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_supported_marketplace(new.marketplace) then
    raise exception 'Unsupported marketplace: %', new.marketplace using errcode = '22023';
  end if;
  return new;
end $$;

create trigger listings_supported_marketplace
  before insert or update of marketplace on public.listings
  for each row execute function public.require_supported_marketplace();
create trigger jobs_supported_marketplace
  before insert or update of marketplace, status on public.jobs
  for each row when (new.status <> 'cancelled')
  execute function public.require_supported_marketplace();
create trigger accounts_supported_marketplace
  before insert or update of marketplace on public.marketplace_accounts
  for each row execute function public.require_supported_marketplace();

create or replace function public.filter_profile_marketplaces() returns trigger
language plpgsql set search_path = public as $$
begin
  new.marketplaces := array(
    select market from unnest(new.marketplaces) with ordinality as m(market, position)
    where public.is_supported_marketplace(market) order by position
  );
  return new;
end $$;

create trigger profiles_supported_marketplaces
  before insert or update of marketplaces on public.profiles
  for each row execute function public.filter_profile_marketplaces();

update public.profiles set marketplaces = marketplaces
where exists (select 1 from unnest(marketplaces) as market where not public.is_supported_marketplace(market));

update public.jobs set status = 'cancelled', error = 'Marketplace is no longer supported.'
where not public.is_supported_marketplace(marketplace)
  and status in ('pending', 'running', 'needs_user');
