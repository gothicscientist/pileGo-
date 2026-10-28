import type { Item, Job } from '@pilego/core';
import { marketName } from '~/components/bits';
import { daysSince } from './format';

export interface NextUp {
  key: string;
  text: string;
  to: string;
  tone: 'urgent' | 'normal';
}

/** The few things worth doing next, most urgent first. */
export function nextUp(items: Item[], jobs: Job[], staleAfter = 30, limit = 4): NextUp[] {
  const out: NextUp[] = [];
  const byId = new Map(items.map(i => [i.id, i]));
  const label = (i: Item | undefined) => (i ? i.title || i.brand || i.sku : 'an item');

  for (const job of jobs) {
    if (job.status !== 'needs_user' && job.status !== 'failed') continue;
    const item = job.item_id ? byId.get(job.item_id) : undefined;
    out.push({
      key: `job-${job.id}`,
      text:
        job.status === 'needs_user'
          ? `Finish ${label(item)} on ${marketName(job.marketplace, true)}`
          : `${marketName(job.marketplace, true)} could not ${job.kind.replace('_', ' ')} ${label(item)}`,
      to: item ? `/item/${item.id}?tab=listings` : '/out',
      tone: 'urgent',
    });
  }
  for (const item of items) {
    if (item.status === 'sold' && (item.listings ?? []).some(l => l.status === 'needs_action')) {
      out.push({ key: `clash-${item.id}`, text: `Take ${label(item)} down by hand`, to: `/item/${item.id}?tab=listings`, tone: 'urgent' });
    }
  }
  for (const item of items) {
    if (item.status === 'sold') out.push({ key: `ship-${item.id}`, text: `Ship ${label(item)}`, to: `/item/${item.id}`, tone: 'normal' });
  }
  for (const item of items) {
    if (item.status === 'draft' && item.price == null) {
      out.push({ key: `price-${item.id}`, text: `Price ${label(item)}`, to: `/item/${item.id}?tab=price`, tone: 'normal' });
    } else if ((item.status === 'draft' || item.status === 'ready') && !(item.listings ?? []).some(l => l.status === 'listed')) {
      out.push({ key: `list-${item.id}`, text: `List ${label(item)}`, to: `/item/${item.id}?crosslist=1`, tone: 'normal' });
    }
  }
  for (const item of items) {
    if (item.status !== 'listed') continue;
    const first = (item.listings ?? []).map(l => l.listed_at).filter(Boolean).sort()[0];
    const days = daysSince(first);
    if (days != null && days >= staleAfter) {
      out.push({ key: `stale-${item.id}`, text: `${label(item)} has sat for ${days} days`, to: `/item/${item.id}?tab=price`, tone: 'normal' });
    }
  }
  return out.slice(0, limit);
}
