import { cleanSellerAddress, type SellerAddress } from '@pilego/core';
import { useState } from 'react';
import { useUpdateProfile, type FullProfile } from '~/lib/queries';
import { SellerAddressFields } from './SellerAddressFields';
import { Button, ErrorNote } from './ui';

export function SellerAddressSettings({ profile }: { profile: FullProfile }) {
  const save = useUpdateProfile();
  const [draft, setDraft] = useState<SellerAddress | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  return (
    <form onSubmit={async e => {
      e.preventDefault();
      setError(null); setSaved(false);
      try {
        await save.mutateAsync({ seller_address: cleanSellerAddress(draft === undefined ? profile.seller_address : draft) });
        setDraft(undefined); setSaved(true);
      } catch (err) { setError(err); }
    }} className="flex flex-col gap-4">
      <fieldset disabled={save.isPending}>
        <SellerAddressFields value={draft === undefined ? profile.seller_address : draft} onChange={v => { setDraft(v); setSaved(false); }} country={profile.region === 'UK' ? 'GB' : profile.region === 'EU' ? '' : profile.region} />
      </fieldset>
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="ink" busy={save.isPending}>Save address</Button>
        {profile.seller_address && <Button variant="ghost" disabled={save.isPending} onClick={async () => {
          setError(null);
          try { await save.mutateAsync({ seller_address: null }); setDraft(null); setSaved(true); } catch (err) { setError(err); }
        }}>Remove saved address</Button>}
        {saved && <span role="status" className="text-sm text-ink-2">{profile.seller_address ? 'Address saved' : 'Address removed'}</span>}
      </div>
    </form>
  );
}

