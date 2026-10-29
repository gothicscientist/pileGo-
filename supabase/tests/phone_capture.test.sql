-- Phone capture codes: each seller sees and closes only their own.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cat@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'dan@example.com');

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', false);

insert into public.phone_sessions (id, item_id)
values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

do $$ begin
  assert (select user_id from public.phone_sessions) = '00000000-0000-0000-0000-0000000000c1', 'the code belongs to its maker';
  assert (select expires_at <= now() + interval '1 hour' from public.phone_sessions), 'codes last an hour';
end $$;

-- A code cannot be made to last longer than an hour.
do $$ begin
  begin
    insert into public.phone_sessions (item_id, expires_at) values (gen_random_uuid(), now() + interval '1 day');
    assert false, 'a day-long code was accepted';
  exception when check_violation then null;
  end;
end $$;

-- Sellers cannot add photos themselves; only the edge function does.
do $$ begin
  begin
    insert into public.phone_photos (id, session_id, user_id, item_id, path)
    values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1',
            '33333333-3333-3333-3333-333333333333', 'x.jpg');
    assert false, 'a seller added a phone photo row';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
insert into public.phone_photos (id, session_id, user_id, item_id, path)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000c1',
        '33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-0000000000c1/33333333-3333-3333-3333-333333333333/a.jpg');

-- Someone else sees nothing and cannot close the code.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', false);
delete from public.phone_sessions;
do $$ begin
  assert (select count(*) from public.phone_sessions) = 0, 'another seller sees no codes';
  assert (select count(*) from public.phone_photos) = 0, 'another seller sees no phone photos';
end $$;

-- The owner sees the photo, and closing the code clears its rows.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', false);
do $$ begin
  assert (select count(*) from public.phone_photos) = 1, 'the owner sees the phone photo';
end $$;
delete from public.phone_sessions;
reset role;
do $$ begin
  assert (select count(*) from public.phone_sessions) = 0, 'the owner closed the code';
  assert (select count(*) from public.phone_photos) = 0, 'closing the code clears its photo rows';
end $$;

-- Leave the database as the other tests expect it.
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');
