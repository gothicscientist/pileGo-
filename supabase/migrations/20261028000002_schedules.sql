-- Scheduled work: eBay order sync and the server job runner.
-- pg_cron and pg_net exist on Supabase; on a plain Postgres (tests) this
-- migration only defines the helper and skips the schedules.

create or replace function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_key text;
begin
  -- Both values are stored in Vault by scripts/deploy.mjs.
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'pilego_project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'pilego_service_key';
  if v_url is null or v_key is null then
    raise notice 'pileGo schedules are not configured yet (missing Vault secrets)';
    return null;
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_body
  );
end $$;

revoke all on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron;
    -- Sold sync and server jobs every 10 minutes, offset so they do not collide.
    perform cron.schedule('pilego-ebay-sync', '*/10 * * * *', $cron$ select public.invoke_edge_function('ebay-sync') $cron$);
    perform cron.schedule('pilego-server-jobs', '5-59/10 * * * *', $cron$ select public.invoke_edge_function('jobs', '{"source":"cron"}'::jsonb) $cron$);
    -- Keep the job table small.
    perform cron.schedule('pilego-prune-jobs', '17 3 * * *', $cron$ delete from public.jobs where status in ('done', 'cancelled') and updated_at < now() - interval '30 days' $cron$);
  end if;
end $$;

-- Live progress in the app for listings and jobs.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.listings, public.jobs, public.items;
  end if;
end $$;
