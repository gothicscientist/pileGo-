-- New listings, jobs and connections cannot revive removed marketplaces.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);

insert into public.items (id, sku, title, price)
values ('44444444-4444-4444-4444-444444444444', 'TOP-DDDDD', 'Test tee', 20);

do $$ declare market text; begin
  foreach market in array array['etsy', 'vestiaire', 'facebook', 'unknown'] loop
    begin
      perform public.queue_publish('44444444-4444-4444-4444-444444444444', array['ebay', market]);
      raise exception 'Unsupported publish was accepted: %', market;
    exception when sqlstate '22023' then null;
    end;
    begin
      insert into public.marketplace_accounts (marketplace) values (market);
      raise exception 'Unsupported connection was accepted: %', market;
    exception when sqlstate '22023' then null;
    end;
    begin
      insert into public.jobs (kind, runner, marketplace, item_id)
      values ('publish', 'extension', market, '44444444-4444-4444-4444-444444444444');
      raise exception 'Unsupported job was accepted: %', market;
    exception when sqlstate '22023' then null;
    end;
  end loop;
  assert (select count(*) from public.listings where item_id = '44444444-4444-4444-4444-444444444444') = 0,
    'mixed publish request rolls back atomically';

  update public.profiles set marketplaces = array['depop', 'etsy', 'facebook', 'grailed', 'vestiaire']
  where id = auth.uid();
  assert (select marketplaces from public.profiles where id = auth.uid()) = array['depop', 'grailed'],
    'old preferences retain only supported marketplaces, in order';
end $$;

select * from public.queue_publish('44444444-4444-4444-4444-444444444444', array['ebay', 'vinted', 'depop', 'poshmark', 'mercari', 'grailed']);
do $$ begin
  assert (select count(*) from public.listings where item_id = '44444444-4444-4444-4444-444444444444') = 6,
    'all six supported marketplaces can still publish';
end $$;
reset role;
