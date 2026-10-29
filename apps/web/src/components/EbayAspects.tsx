// eBay item specifics the server could not work out from the item. The eBay
// job stores which ones it needs (and, for pick-list ones, the allowed
// values) on the listing; the seller fills them in here and lists again.

import type { Listing } from '@pilego/core';
import { useId, useState } from 'react';
import { useToast } from './overlay';
import { Button, Field, Input, Select } from './ui';
import { useListingJob, useUpdateListing } from '~/lib/queries';
import { errorMessage } from '~/lib/supabase';

export function missingEbayAspects(listing: Listing): string[] {
  const missing = (listing.payload as { missing_aspects?: unknown }).missing_aspects;
  return listing.marketplace === 'ebay' && listing.status === 'needs_action' && Array.isArray(missing)
    ? missing.filter((m): m is string => typeof m === 'string')
    : [];
}

export function EbayAspects({ listing }: { listing: Listing }) {
  const missing = missingEbayAspects(listing);
  const payload = listing.payload as { aspects?: Record<string, string[]>; aspect_choices?: Record<string, string[]> };
  const choices = payload.aspect_choices ?? {};
  const [values, setValues] = useState<Record<string, string>>({});
  const update = useUpdateListing();
  const job = useListingJob();
  const toast = useToast();
  const base = useId();

  if (!missing.length) return null;
  const ready = missing.every(name => values[name]?.trim());

  async function submit() {
    const aspects = { ...(payload.aspects ?? {}) };
    for (const name of missing) aspects[name] = [values[name]!.trim()];
    try {
      const saved = await update.mutateAsync({ id: listing.id, patch: { payload: { ...listing.payload, aspects } } });
      await job.mutateAsync({ listing: saved, kind: 'relist' });
      toast('Listing on eBay again');
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-lg bg-paper-2 p-3"
      onSubmit={e => {
        e.preventDefault();
        if (ready) void submit();
      }}
    >
      <p className="text-sm font-semibold">eBay needs these item specifics for this category</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {missing.map((name, i) => {
          const id = `${base}-${i}`;
          const options = choices[name] ?? [];
          return (
            <Field key={name} label={name} htmlFor={id}>
              {options.length ? (
                <Select id={id} value={values[name] ?? ''} onChange={e => setValues(v => ({ ...v, [name]: e.target.value }))}>
                  <option value="">Choose</option>
                  {options.map(o => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input id={id} value={values[name] ?? ''} maxLength={65} onChange={e => setValues(v => ({ ...v, [name]: e.target.value }))} />
              )}
            </Field>
          );
        })}
      </div>
      <Button type="submit" size="sm" variant="tag" className="self-start" disabled={!ready} busy={update.isPending || job.isPending}>
        Save and list again
      </Button>
    </form>
  );
}
