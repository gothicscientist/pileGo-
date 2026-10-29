// The listing kit: everything a seller needs to paste a listing into any
// marketplace by hand. Used for Etsy and Vestiaire, and as the fallback for
// every other marketplace when the extension is not around.

import { listingKitText, MARKETPLACES, type GeneratedListing, type Item, type Listing } from '@pilego/core';
import { Check, Copy, Download, ExternalLink, Share2 } from 'lucide-react';
import { useState } from 'react';
import { cx } from '~/lib/format';
import { fetchPhotoBlob, useUpdateListing } from '~/lib/queries';
import { errorMessage } from '~/lib/supabase';
import { useToast } from './overlay';
import { Button, Input } from './ui';

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-ink-2 transition hover:bg-paper-2 hover:text-ink active:scale-95',
        className,
      )}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        } catch {
          // Clipboard blocked; the text is still selectable.
        }
      }}
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {done ? 'Copied' : label}
    </button>
  );
}

async function photoFiles(item: Item): Promise<File[]> {
  const photos = (item.photos ?? []).slice(0, 24);
  const files: File[] = [];
  for (const [i, p] of photos.entries()) {
    const blob = await fetchPhotoBlob(p.path);
    files.push(new File([blob], `${item.sku}-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' }));
  }
  return files;
}

export function PhotoActions({ item }: { item: Item }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator;

  async function download() {
    setBusy(true);
    try {
      for (const f of await photoFiles(item)) {
        const url = URL.createObjectURL(f);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      const files = await photoFiles(item);
      if (navigator.canShare?.({ files })) await navigator.share({ files, title: item.title });
      else await download();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (!item.photos?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="line" busy={busy} icon={<Download className="size-4" aria-hidden />} onClick={download}>
        Download {item.photos.length} photos
      </Button>
      {canShare && (
        <Button size="sm" variant="line" disabled={busy} icon={<Share2 className="size-4" aria-hidden />} onClick={share} className="sm:hidden">
          Share to an app
        </Button>
      )}
    </div>
  );
}

export function ListingKit({ item, listing, generated }: { item: Item; listing?: Listing; generated: GeneratedListing }) {
  const info = MARKETPLACES[generated.marketplace];
  const update = useUpdateListing();
  const toast = useToast();
  const [url, setUrl] = useState(listing?.external_url ?? '');
  const all = listingKitText(generated);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <a href={info.sell_url} target="_blank" rel="noreferrer" className="btn btn-ink btn-sm">
          <ExternalLink className="size-4" aria-hidden />
          Open {info.name}
        </a>
        <PhotoActions item={item} />
        <CopyButton text={all} label="Copy everything" className="ml-auto" />
      </div>

      <dl className="divide-y divide-dashed divide-line rounded-xl border border-line bg-card">
        {generated.title && <KitRow label="Title" value={generated.title} />}
        <KitRow label="Description" value={generated.description} long />
        {generated.fields
          .filter(f => f.key !== 'title')
          .map(f => (
            <KitRow key={f.key} label={f.label} value={f.value} />
          ))}
      </dl>

      {listing && listing.status !== 'listed' && listing.status !== 'sold' && (
        <form
          className="flex flex-col gap-2 rounded-xl bg-paper-2 p-3"
          onSubmit={async e => {
            e.preventDefault();
            try {
              await update.mutateAsync({
                id: listing.id,
                patch: { status: 'listed', external_url: url.trim() || null, listed_at: new Date().toISOString(), error: null },
              });
              toast(`Marked as listed on ${info.name}`);
            } catch (err) {
              toast(errorMessage(err), { tone: 'error' });
            }
          }}
        >
          <label className="text-sm font-semibold" htmlFor={`kit-url-${listing.id}`}>
            Listed it? Paste the link so pileGo! can track it.
          </label>
          <div className="flex gap-2">
            <Input
              id={`kit-url-${listing.id}`}
              type="url"
              placeholder={`${new URL(info.sell_url).origin}/...`}
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
            <Button type="submit" variant="ink" busy={update.isPending}>
              Mark listed
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function KitRow({ label, value, long }: { label: string; value: string; long?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <dt className="w-24 shrink-0 pt-0.5 text-xs font-semibold text-muted">{label}</dt>
      <dd className={cx('min-w-0 flex-1 text-sm', long && 'max-h-48 overflow-y-auto whitespace-pre-wrap')}>{value}</dd>
      <CopyButton text={value} />
    </div>
  );
}
