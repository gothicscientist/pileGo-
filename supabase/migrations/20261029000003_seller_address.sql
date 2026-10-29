-- Private seller contact information, protected by profiles' existing owner-only RLS.
alter table public.profiles add column seller_address jsonb;
alter table public.profiles add constraint profiles_seller_address_shape check (
  seller_address is null or (
    jsonb_typeof(seller_address) = 'object'
    and seller_address ?& array['full_name', 'line1', 'city', 'state', 'postal_code', 'country']
    and jsonb_typeof(seller_address->'full_name') = 'string'
    and jsonb_typeof(seller_address->'line1') = 'string'
    and jsonb_typeof(seller_address->'city') = 'string'
    and jsonb_typeof(seller_address->'state') = 'string'
    and jsonb_typeof(seller_address->'postal_code') = 'string'
    and jsonb_typeof(seller_address->'country') = 'string'
    and length(trim(seller_address->>'full_name')) between 1 and 200
    and length(trim(seller_address->>'line1')) between 1 and 200
    and length(trim(seller_address->>'city')) between 1 and 200
    and length(seller_address->>'state') <= 200
    and length(trim(seller_address->>'postal_code')) between 1 and 40
    and seller_address->>'country' ~ '^[A-Z]{2}$'
    and octet_length(seller_address::text) <= 3000
  )
);
comment on column public.profiles.seller_address is 'Private ship-from/return address for seller setup. Never part of public listing text or AI scan requests.';

