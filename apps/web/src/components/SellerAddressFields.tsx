import { ADDRESS_COUNTRIES, blankSellerAddress, type SellerAddress } from '@pilego/core';
import { useId } from 'react';
import { Field, Select, TextField } from './ui';

export function SellerAddressFields({ value, onChange, country = 'US' }: {
  value: SellerAddress | null | undefined;
  onChange: (address: SellerAddress) => void;
  country?: string;
}) {
  const address = value ?? blankSellerAddress(country);
  const countryId = useId();
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const set = (key: keyof SellerAddress, text: string) => onChange({ ...address, [key]: text });
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold text-ink-2">Your ship-from / return address (optional)</legend>
      <p className="text-xs text-muted">Save it once for empty seller-address forms. An address already saved on a marketplace stays as it is. This is never added to your public listing description.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Full name" autoComplete="section-seller shipping name" value={address.full_name} onChange={e => set('full_name', e.target.value)} maxLength={200} />
        <Field label="Country" htmlFor={countryId}>
          <Select id={countryId} autoComplete="section-seller shipping country" value={address.country} onChange={e => set('country', e.target.value)}>
            <option value="">Choose country</option>
            {ADDRESS_COUNTRIES.map(code => <option key={code} value={code}>{names.of(code)}</option>)}
          </Select>
        </Field>
        <TextField label="Street address" autoComplete="section-seller shipping address-line1" value={address.line1} onChange={e => set('line1', e.target.value)} maxLength={200} className="sm:col-span-2" />
        <TextField label="Apartment, suite, etc. (optional)" autoComplete="section-seller shipping address-line2" value={address.line2} onChange={e => set('line2', e.target.value)} maxLength={200} className="sm:col-span-2" />
        <TextField label="City / town" autoComplete="section-seller shipping address-level2" value={address.city} onChange={e => set('city', e.target.value)} maxLength={200} />
        <TextField label="State / province / region" autoComplete="section-seller shipping address-level1" value={address.state} onChange={e => set('state', e.target.value)} maxLength={200} />
        <TextField label="ZIP / postal code" autoComplete="section-seller shipping postal-code" value={address.postal_code} onChange={e => set('postal_code', e.target.value)} maxLength={40} />
        <TextField label="Phone (optional)" type="tel" autoComplete="section-seller shipping tel" value={address.phone} onChange={e => set('phone', e.target.value)} maxLength={40} />
      </div>
    </fieldset>
  );
}

