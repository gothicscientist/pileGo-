begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ca', 'address-owner@example.com'),
  ('00000000-0000-0000-0000-0000000000cb', 'other-seller@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ca","role":"authenticated"}', true);
update public.profiles set seller_address = '{"full_name":"Sam Seller","line1":"123 Test Lane","line2":"","city":"Berkeley","state":"CA","postal_code":"09470","country":"US","phone":""}'::jsonb;

do $$ begin
  assert (select count(*) from public.profiles) = 1, 'address owner sees only their own profile';
  assert (select seller_address->>'postal_code' from public.profiles) = '09470', 'address preserves postal leading zero';
  begin
    update public.profiles set seller_address = '{"full_name":"incomplete"}'::jsonb;
    raise exception 'invalid address was accepted';
  exception when check_violation then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000cb","role":"authenticated"}', true);
do $$ declare n int; begin
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000ca'), 'other seller cannot read the address';
  update public.profiles set seller_address = null where id = '00000000-0000-0000-0000-0000000000ca';
  get diagnostics n = row_count;
  assert n = 0, 'other seller cannot change the address';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ca","role":"authenticated"}', true);
update public.profiles set seller_address = null;
do $$ begin
  assert (select seller_address is null from public.profiles), 'owner can remove the saved address';
end $$;
rollback;

