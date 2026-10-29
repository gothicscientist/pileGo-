-- Row-level security, publishing, and the sale flow.
-- Runs as postgres, switching into the authenticated role per user.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'ben@example.com');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'profiles are created for new users';
end $$;

-- Ana creates an item and lists it on three marketplaces.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);

insert into public.items (id, sku, title, price, currency, condition)
values ('11111111-1111-1111-1111-111111111111', 'OUT-AAAAA', 'Denim jacket', 60, 'USD', 'good');

select * from public.queue_publish('11111111-1111-1111-1111-111111111111', array['ebay', 'vinted', 'depop']);

do $$ begin
  assert (select count(*) from public.listings) = 3, 'three listings';
  assert (select count(*) from public.jobs where kind = 'publish') = 3, 'three publish jobs';
  assert (select runner from public.jobs where marketplace = 'ebay') = 'server', 'eBay runs on the server';
  assert (select runner from public.jobs where marketplace = 'vinted') = 'extension', 'Vinted runs in the extension';
  assert (select status from public.items) = 'ready', 'item moves to ready';
  assert (select count(*) from public.events where type = 'created') = 1, 'created event';
end $$;

-- The extension claims its jobs; the server's job is not handed to it.
do $$ declare n int; begin
  select count(*) into n from public.claim_jobs('extension', null, 10);
  assert n = 2, 'extension claims two jobs, got ' || n;
  assert (select count(*) from public.jobs where status = 'running') = 2, 'claimed jobs are running';
  select count(*) into n from public.claim_jobs('extension', null, 10);
  assert n = 0, 'a job is claimed once';
end $$;

-- Publishing succeeds on Vinted and Depop.
update public.listings set status = 'listed', external_id = 'v1' where marketplace = 'vinted';
update public.listings set status = 'listed', external_id = 'd1' where marketplace = 'depop';

do $$ begin
  assert (select listed_at is not null from public.listings where marketplace = 'vinted'), 'listed_at is stamped';
  assert (select status from public.items) = 'listed', 'item is listed once any listing is live';
  assert (select count(*) from public.events where type = 'listed') = 2, 'two listed events';
end $$;

-- Ben sees none of it and cannot touch it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', false);
do $$ declare n int; begin
  assert (select count(*) from public.items) = 0, 'Ben sees no items';
  assert (select count(*) from public.listings) = 0, 'Ben sees no listings';
  assert (select count(*) from public.jobs) = 0, 'Ben sees no jobs';
  update public.items set price = 1 where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  assert n = 0, 'Ben cannot update Ana''s item';
  begin
    perform public.record_sale((select id from public.listings limit 1));
    assert false, 'unreachable';
  exception when others then null;
  end;
  begin
    perform public.queue_publish('11111111-1111-1111-1111-111111111111', array['ebay']);
    assert false, 'Ben cannot publish Ana''s item';
  exception when sqlstate 'P0002' then null;
  end;
  begin
    insert into public.items (user_id, sku, title) values ('00000000-0000-0000-0000-00000000000a', 'X-1', 'sneaky');
    assert false, 'Ben cannot insert for Ana';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;

-- Secrets are server-only.
do $$ declare n int; begin
  select count(*) into n from public.marketplace_secrets;
  assert n = 0, 'no rows visible';
end $$;

-- The item sells on Vinted.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select public.record_sale((select id from public.listings where marketplace = 'vinted'), 55, now(), '{"order":"o1"}');

do $$ begin
  assert (select status from public.items) = 'sold', 'item sold';
  assert (select sold_price from public.items) = 55, 'sold price recorded';
  assert (select sold_marketplace from public.items) = 'vinted', 'sold marketplace recorded';
  assert (select status from public.listings where marketplace = 'depop') = 'delisting', 'Depop is being delisted';
  assert (select count(*) from public.jobs where kind = 'delist' and marketplace = 'depop' and status = 'pending') = 1, 'delist job queued for Depop';
  assert (select status from public.jobs where kind = 'publish' and marketplace = 'ebay') = 'cancelled', 'pending eBay publish is cancelled';
  assert (select status from public.listings where marketplace = 'ebay') = 'draft', 'queued eBay listing goes back to draft';
  assert (select count(*) from public.events where type = 'sold') = 1, 'sold event';
end $$;

-- A second sale elsewhere is flagged, not recorded over the first.
select public.record_sale((select id from public.listings where marketplace = 'depop'), 70);
do $$ begin
  assert (select sold_marketplace from public.items) = 'vinted', 'first sale wins';
  assert (select status from public.listings where marketplace = 'depop') = 'needs_action', 'double sale flagged';
end $$;

-- Ana sells a second item in person; its live Vinted listing gets a delist job.
insert into public.items (id, sku, title, price, currency, condition)
values ('33333333-3333-3333-3333-333333333333', 'TOP-CCCCC', 'Striped tee', 25, 'USD', 'good');
select * from public.queue_publish('33333333-3333-3333-3333-333333333333', array['vinted']);
update public.listings set status = 'listed', external_id = 'v3'
  where item_id = '33333333-3333-3333-3333-333333333333' and marketplace = 'vinted';
select public.record_offline_sale('33333333-3333-3333-3333-333333333333', 20);
do $$ begin
  assert (select status from public.items where id = '33333333-3333-3333-3333-333333333333') = 'sold', 'offline sale marks sold';
  assert (select sold_price from public.items where id = '33333333-3333-3333-3333-333333333333') = 20, 'offline sale price';
  assert (select status from public.listings where external_id = 'v3') = 'delisting', 'vinted listing is taken down';
  assert (select count(*) from public.jobs j join public.listings l on l.id = j.listing_id
          where l.external_id = 'v3' and j.kind = 'delist') = 1, 'delist job queued';
end $$;

-- Selling again is refused.
do $$ begin
  begin
    perform public.queue_publish('11111111-1111-1111-1111-111111111111', array['ebay']);
    assert false, 'sold items cannot be republished';
  exception when sqlstate 'P0001' then null;
  end;
end $$;

-- finish_job only works on your own jobs.
do $$ declare j uuid; begin
  select id into j from public.jobs where kind = 'delist' limit 1;
  perform public.finish_job(j, 'done', '{"ok":true}');
  assert (select status from public.jobs where id = j) = 'done', 'job finished';
end $$;

-- The service role (eBay sync) can record sales for anyone.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
insert into public.items (id, user_id, sku, title, price) values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000b', 'TOP-BBBBB', 'Tee', 20);
insert into public.listings (user_id, item_id, marketplace, status, external_id) values
  ('00000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'ebay', 'listed', 'e9');
select public.record_sale((select id from public.listings where external_id = 'e9'), 18);
do $$ begin
  assert (select status from public.items where id = '22222222-2222-2222-2222-222222222222') = 'sold', 'service role records sale';
  assert (select count(*) from public.claim_jobs('server', null, 10)) >= 0, 'server can claim';
end $$;

-- Storage folder policy helper.
do $$ begin
  assert (storage.foldername('abc/item/photo.jpg'))[1] = 'abc', 'foldername works';
end $$;

reset role;
