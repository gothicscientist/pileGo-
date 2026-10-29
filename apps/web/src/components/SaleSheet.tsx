import { MARKETPLACES, type Item } from '@pilego/core';
import { useEffect, useState } from 'react';
import { cx, money } from '~/lib/format';
import { useRecordSale } from '~/lib/queries';
import { errorMessage } from '~/lib/supabase';
import { Sticker } from './bits';
import { Sheet, useToast } from './overlay';
import { Button, ErrorNote, TextField } from './ui';

/** Record a sale by hand. pileGo then takes the item down everywhere else. */
export function SaleSheet({ item, open, onClose }: { item: Item; open: boolean; onClose: () => void }) {
  const live = (item.listings ?? []).filter(l => ['listed', 'publishing', 'needs_action', 'delisting'].includes(l.status));
  const [where, setWhere] = useState<string>('elsewhere');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sale = useRecordSale();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setWhere(live[0]?.id ?? 'elsewhere');
    setPrice(item.price != null ? String(item.price) : '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const others = live.filter(l => l.id !== where);

  async function submit() {
    setError(null);
    const n = price.trim() === '' ? null : Number(price);
    if (n != null && !Number.isFinite(n)) {
      setError('Enter the price as a number.');
      return;
    }
    try {
      await sale.mutateAsync({ itemId: item.id, listingId: where === 'elsewhere' ? undefined : where, price: n });
      toast(others.length ? `Sold. Taking it down from ${others.length} other ${others.length === 1 ? 'place' : 'places'}.` : 'Sold.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mark as sold"
      footer={
        <div className="flex flex-col gap-2">
          <ErrorNote error={error} />
          <Button variant="tag" className="self-start text-base" busy={sale.isPending} onClick={submit}>
            Mark sold
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink-2">Where did it sell?</legend>
          <div className="flex flex-col gap-1.5">
            {live.map(l => (
              <label
                key={l.id}
                className={cx('flex cursor-pointer items-center gap-3 rounded-xl border-2 p-2.5', where === l.id ? 'border-ink' : 'border-line')}
              >
                <input type="radio" name="where" className="accent-[var(--ink)]" checked={where === l.id} onChange={() => setWhere(l.id)} />
                <Sticker id={l.marketplace} size="sm" />
                <span className="text-sm text-ink-2">listed at {money(l.price, item.currency)}</span>
              </label>
            ))}
            <label
              className={cx('flex cursor-pointer items-center gap-3 rounded-xl border-2 p-2.5', where === 'elsewhere' ? 'border-ink' : 'border-line')}
            >
              <input type="radio" name="where" className="accent-[var(--ink)]" checked={where === 'elsewhere'} onChange={() => setWhere('elsewhere')} />
              <span className="text-sm font-medium">Somewhere else: in person, a market, a message</span>
            </label>
          </div>
        </fieldset>
        <TextField label={`Sold for (${item.currency})`} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} className="max-w-48" />
        {others.length > 0 && (
          <p className="text-sm text-ink-2">
            pileGo will end it on {others.map(l => MARKETPLACES[l.marketplace].name).join(', ')}. Listing-kit and Facebook listings are flagged for
            you to remove by hand.
          </p>
        )}
      </div>
    </Sheet>
  );
}
