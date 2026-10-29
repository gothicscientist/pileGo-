// Data access for the app: TanStack Query hooks over Supabase, plus the
// mutations that change items, photos, listings and settings. Realtime
// changes from the extension and the server invalidate the same keys.

import {
  makeSku,
  type Item,
  type ItemEvent,
  type Job,
  type JobKind,
  type Listing,
  type MarketplaceId,
  type PriceComp,
  type PriceSuggestion,
  type Profile,
  type ScanResult,
} from '@pilego/core';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from './auth';
import { pokeExtension } from './extension';
import { cutOut, newId, prepareImage, removePhotos, signedUrls, uploadPhoto } from './photos';
import { callFunction, supabase } from './supabase';

export type PriceStrategyName = 'same' | 'match_take_home';
export type FullProfile = Profile & { price_strategy: PriceStrategyName };

export interface MarketplaceAccount {
  id: string;
  marketplace: MarketplaceId;
  status: 'connected' | 'expired' | 'error' | 'disconnected';
  username: string | null;
  meta: Record<string, unknown>;
  last_sync_at: string | null;
  last_error: string | null;
}

export const keys = {
  profile: ['profile'] as const,
  items: ['items'] as const,
  item: (id: string) => ['items', id] as const,
  jobs: ['jobs'] as const,
  events: (itemId?: string) => ['events', itemId ?? 'all'] as const,
  accounts: ['accounts'] as const,
  ebay: ['ebay-status'] as const,
  photos: (paths: string[]) => ['photo-urls', ...paths] as const,
};

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** PostgREST returns numeric columns as strings; the app wants numbers. */
function normalizeItem(row: Item): Item {
  return {
    ...row,
    price: num(row.price),
    original_price: num(row.original_price),
    cost: num(row.cost),
    sold_price: num(row.sold_price),
    photos: [...(row.photos ?? [])].sort((a, b) => a.position - b.position),
    listings: (row.listings ?? []).map(normalizeListing),
  };
}

function normalizeListing(row: Listing): Listing {
  return { ...row, price: num(row.price) };
}

const ITEM_SELECT = '*, photos:item_photos(*), listings(*)';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useProfile() {
  const { session } = useAuth();
  return useQuery({
    queryKey: keys.profile,
    enabled: Boolean(session),
    queryFn: async () => {
      const row = check(await supabase.from('profiles').select('*').eq('id', session!.user.id).maybeSingle());
      return row as FullProfile | null;
    },
    staleTime: 5 * 60_000,
  });
}

export function useItems() {
  const { session } = useAuth();
  return useQuery({
    queryKey: keys.items,
    enabled: Boolean(session),
    queryFn: async () => {
      const rows = check(
        await supabase.from('items').select(ITEM_SELECT).order('created_at', { ascending: false }).limit(2000),
      ) as Item[];
      return rows.map(normalizeItem);
    },
  });
}

export function useItem(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.item(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const row = check(await supabase.from('items').select(ITEM_SELECT).eq('id', id!).maybeSingle()) as Item | null;
      return row ? normalizeItem(row) : null;
    },
    initialData: () => qc.getQueryData<Item[]>(keys.items)?.find(i => i.id === id),
  });
}

export function useJobs() {
  const { session } = useAuth();
  return useQuery({
    queryKey: keys.jobs,
    enabled: Boolean(session),
    queryFn: async () =>
      check(
        await supabase
          .from('jobs')
          .select('*')
          .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(200),
      ) as Job[],
  });
}

export function useEvents(itemId?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: keys.events(itemId),
    enabled: Boolean(session),
    queryFn: async () => {
      let q = supabase.from('events').select('*').order('at', { ascending: false }).limit(itemId ? 100 : 40);
      if (itemId) q = q.eq('item_id', itemId);
      return check(await q) as ItemEvent[];
    },
  });
}

export function useAccounts() {
  const { session } = useAuth();
  return useQuery({
    queryKey: keys.accounts,
    enabled: Boolean(session),
    queryFn: async () => check(await supabase.from('marketplace_accounts').select('*')) as MarketplaceAccount[],
  });
}

export interface EbayStatus {
  configured: boolean;
  /** Which eBay settings the server has, without their values. */
  setup?: {
    environment: 'production' | 'sandbox';
    client_id: boolean;
    client_secret: boolean;
    ru_name: boolean;
    verification_token: boolean;
    app_url: boolean;
  };
  connected: boolean;
  account: MarketplaceAccount | null;
}

export function useEbayStatus() {
  const { session } = useAuth();
  return useQuery({
    queryKey: keys.ebay,
    enabled: Boolean(session),
    queryFn: () => callFunction<EbayStatus>('ebay-connect', { action: 'status' }),
    staleTime: 60_000,
    retry: 1,
  });
}

/** Signed URLs for a set of storage paths. */
export function usePhotoUrls(paths: Array<string | null | undefined>) {
  const clean = [...new Set(paths.filter((p): p is string => Boolean(p)))].sort();
  return useQuery({
    queryKey: keys.photos(clean),
    enabled: clean.length > 0,
    queryFn: () => signedUrls(clean),
    staleTime: 45 * 60_000,
    gcTime: 60 * 60_000,
  });
}

/** Keep the cache fresh while the extension and the server change things. */
export function useRealtime() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    let timer: number | undefined;
    const pending = new Set<string>();
    const flush = () => {
      for (const key of pending) void qc.invalidateQueries({ queryKey: [key] });
      pending.clear();
      timer = undefined;
    };
    const bump = (key: string) => {
      pending.add(key);
      timer ??= window.setTimeout(flush, 250);
    };
    const channel = supabase
      .channel(`pilego-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${uid}` }, () =>
        bump('items'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings', filter: `user_id=eq.${uid}` }, () => {
        bump('items');
        bump('events');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${uid}` }, () =>
        bump('jobs'),
      )
      .subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [uid, qc]);
}

function refreshItems(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.items });
  void qc.invalidateQueries({ queryKey: ['events'] });
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export interface StagedPhoto {
  id: string;
  path: string;
  cutout_path: string | null;
  width: number;
  height: number;
  /** Local preview while the upload is in flight. */
  preview: string;
}

/** Resize and upload one photo into the item's folder. */
export async function stagePhoto(uid: string, itemId: string, file: Blob): Promise<StagedPhoto> {
  const id = newId();
  const { blob, width, height } = await prepareImage(file);
  const path = `${uid}/${itemId}/${id}.jpg`;
  await uploadPhoto(path, blob);
  return { id, path, cutout_path: null, width, height, preview: URL.createObjectURL(blob) };
}

/** Cut the garment out of a photo and upload the transparent version. */
export async function stageCutout(
  uid: string,
  itemId: string,
  photoId: string,
  source: Blob,
  onProgress?: (f: number) => void,
): Promise<{ cutout_path: string; preview: string }> {
  const cut = await cutOut(source, onProgress);
  const cutout_path = `${uid}/${itemId}/${photoId}-cut.webp`;
  await uploadPhoto(cutout_path, cut);
  return { cutout_path, preview: URL.createObjectURL(cut) };
}

export async function fetchPhotoBlob(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('photos').download(path);
  if (error || !data) throw error ?? new Error('Could not download that photo.');
  return data;
}

// ---------------------------------------------------------------------------
// Item mutations
// ---------------------------------------------------------------------------

export type ItemDraft = Partial<
  Pick<
    Item,
    | 'title'
    | 'brand'
    | 'department'
    | 'category'
    | 'subcategory'
    | 'size'
    | 'size_system'
    | 'colors'
    | 'materials'
    | 'condition'
    | 'flaws'
    | 'measurements'
    | 'style_tags'
    | 'era'
    | 'description'
    | 'price'
    | 'original_price'
    | 'cost'
    | 'currency'
    | 'location'
    | 'notes'
    | 'ai'
    | 'status'
    | 'price_suggestion'
  >
>;

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; draft: ItemDraft; photos: StagedPhoto[] }) => {
      const sku = makeSku(input.draft.category);
      const item = check(
        await supabase
          .from('items')
          .insert({ id: input.id, sku, status: 'draft', ...input.draft })
          .select()
          .single(),
      ) as Item;
      if (input.photos.length) {
        check(
          await supabase.from('item_photos').insert(
            input.photos.map((p, i) => ({
              id: p.id,
              item_id: item.id,
              path: p.path,
              cutout_path: p.cutout_path,
              position: i,
              width: p.width,
              height: p.height,
            })),
          ),
        );
      }
      return item;
    },
    onSuccess: () => refreshItems(qc),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ItemDraft }) =>
      normalizeItem(check(await supabase.from('items').update(patch).eq('id', id).select(ITEM_SELECT).single()) as Item),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: keys.items });
      const before = qc.getQueryData<Item[]>(keys.items);
      qc.setQueryData<Item[]>(keys.items, list => list?.map(i => (i.id === id ? { ...i, ...patch } : i)));
      qc.setQueryData<Item | null>(keys.item(id), i => (i ? { ...i, ...patch } : i));
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(keys.items, ctx.before);
    },
    onSettled: (_d, _e, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.item(id) });
      refreshItems(qc);
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Item) => {
      const paths = (item.photos ?? []).flatMap(p => [p.path, p.cutout_path].filter(Boolean) as string[]);
      check(await supabase.from('items').delete().eq('id', item.id));
      await removePhotos(paths).catch(() => undefined);
    },
    onSuccess: () => refreshItems(qc),
  });
}

export function useAddPhotos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, uid, files }: { item: Item; uid: string; files: File[] }) => {
      const start = (item.photos ?? []).reduce((m, p) => Math.max(m, p.position + 1), 0);
      const staged: StagedPhoto[] = [];
      for (const f of files) staged.push(await stagePhoto(uid, item.id, f));
      check(
        await supabase.from('item_photos').insert(
          staged.map((p, i) => ({
            id: p.id,
            item_id: item.id,
            path: p.path,
            position: start + i,
            width: p.width,
            height: p.height,
          })),
        ),
      );
    },
    onSuccess: (_d, { item }) => {
      void qc.invalidateQueries({ queryKey: keys.item(item.id) });
      refreshItems(qc);
    },
  });
}

export function usePhotoActions() {
  const qc = useQueryClient();
  const done = (itemId: string) => {
    void qc.invalidateQueries({ queryKey: keys.item(itemId) });
    refreshItems(qc);
  };
  const remove = useMutation({
    mutationFn: async (photo: { id: string; item_id: string; path: string; cutout_path: string | null }) => {
      check(await supabase.from('item_photos').delete().eq('id', photo.id));
      await removePhotos([photo.path, photo.cutout_path].filter(Boolean) as string[]).catch(() => undefined);
    },
    onSuccess: (_d, p) => done(p.item_id),
  });
  const makeCover = useMutation({
    mutationFn: async ({ item, photoId }: { item: Item; photoId: string }) => {
      const order = [photoId, ...(item.photos ?? []).map(p => p.id).filter(id => id !== photoId)];
      for (const [position, id] of order.entries()) {
        check(await supabase.from('item_photos').update({ position }).eq('id', id));
      }
    },
    onSuccess: (_d, v) => done(v.item.id),
  });
  const setCutout = useMutation({
    mutationFn: async ({ photoId, cutout_path }: { itemId: string; photoId: string; cutout_path: string | null }) => {
      check(await supabase.from('item_photos').update({ cutout_path }).eq('id', photoId));
    },
    onSuccess: (_d, v) => done(v.itemId),
  });
  return { remove, makeCover, setCutout };
}

// ---------------------------------------------------------------------------
// AI and pricing
// ---------------------------------------------------------------------------

export function scanPhotos(paths: string[], currency: string, hint?: string): Promise<ScanResult> {
  return callFunction<ScanResult>('scan-item', { photos: paths, currency, hint: hint || undefined });
}

export interface PriceCompsResult {
  suggestion: PriceSuggestion | null;
  comps: PriceComp[];
  error: string | null;
}

export function usePriceComps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => callFunction<PriceCompsResult>('price-comps', { item_id: itemId }),
    onSuccess: (_d, itemId) => {
      void qc.invalidateQueries({ queryKey: keys.item(itemId) });
      refreshItems(qc);
    },
  });
}

// ---------------------------------------------------------------------------
// Listings and jobs
// ---------------------------------------------------------------------------

/** Nudge whoever runs the new jobs: the server for eBay, the extension for the rest. */
function kickRunners(marketplaces: MarketplaceId[]) {
  if (marketplaces.includes('ebay')) void callFunction('jobs').catch(() => undefined);
  if (marketplaces.some(m => m !== 'ebay')) pokeExtension();
}

export interface ListingOverride {
  title?: string;
  price?: number;
  description?: string;
  [key: string]: unknown;
}

export function useQueuePublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      marketplaces,
      overrides,
    }: {
      itemId: string;
      marketplaces: MarketplaceId[];
      overrides?: Partial<Record<MarketplaceId, ListingOverride>>;
    }) => {
      const rows = check(
        await supabase.rpc('queue_publish', {
          p_item_id: itemId,
          p_marketplaces: marketplaces,
          p_overrides: overrides ?? {},
        }),
      ) as Listing[];
      kickRunners(marketplaces);
      return rows;
    },
    onSettled: () => {
      refreshItems(qc);
      void qc.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

export function useListingJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      listing,
      kind,
      payload,
    }: {
      listing: Listing;
      kind: Extract<JobKind, 'delist' | 'relist' | 'update_price'>;
      payload?: Record<string, unknown>;
    }) => {
      const job = check(
        await supabase.rpc('queue_listing_job', { p_listing_id: listing.id, p_kind: kind, p_payload: payload ?? {} }),
      ) as Job;
      kickRunners([listing.marketplace]);
      return job;
    },
    onSettled: () => {
      refreshItems(qc);
      void qc.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

/** For listing-kit marketplaces: the seller says where the listing went live. */
export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Listing> }) =>
      check(await supabase.from('listings').update(patch).eq('id', id).select().single()) as Listing,
    onSettled: () => refreshItems(qc),
  });
}

export function useRemoveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      check(await supabase.from('listings').delete().eq('id', id));
    },
    onSettled: () => refreshItems(qc),
  });
}

export function useRecordSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { listingId?: string; itemId: string; price: number | null }) => {
      if (input.listingId) {
        check(await supabase.rpc('record_sale', { p_listing_id: input.listingId, p_price: input.price }));
      } else {
        check(await supabase.rpc('record_offline_sale', { p_item_id: input.itemId, p_price: input.price }));
      }
      pokeExtension();
      void callFunction('jobs').catch(() => undefined);
    },
    onSettled: () => {
      refreshItems(qc);
      void qc.invalidateQueries({ queryKey: keys.jobs });
    },
  });
}

export function useRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: Job) => {
      check(
        await supabase
          .from('jobs')
          .update({ status: 'pending', run_after: new Date().toISOString(), error: null })
          .eq('id', job.id),
      );
      kickRunners([job.marketplace]);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.jobs }),
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: Job) => {
      check(await supabase.from('jobs').update({ status: 'cancelled' }).eq('id', job.id));
      if (job.listing_id && job.kind === 'publish') {
        await supabase.from('listings').update({ status: 'draft' }).eq('id', job.listing_id).eq('status', 'queued');
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.jobs });
      refreshItems(qc);
    },
  });
}

// ---------------------------------------------------------------------------
// Settings and eBay
// ---------------------------------------------------------------------------

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<FullProfile>) =>
      check(await supabase.from('profiles').update(patch).eq('id', session!.user.id).select().single()) as FullProfile,
    onMutate: patch => {
      const before = qc.getQueryData<FullProfile>(keys.profile);
      if (before) qc.setQueryData(keys.profile, { ...before, ...patch });
      return { before };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.before) qc.setQueryData(keys.profile, ctx.before);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.profile }),
  });
}

export interface EbayPolicies {
  fulfillment: Array<{ id: string; name: string }>;
  payment: Array<{ id: string; name: string }>;
  returns: Array<{ id: string; name: string }>;
}

export function useEbayPolicies(enabled: boolean) {
  return useQuery({
    queryKey: ['ebay-policies'],
    enabled,
    queryFn: () => callFunction<EbayPolicies>('ebay-connect', { action: 'policies' }),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useEbayActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.ebay });
    void qc.invalidateQueries({ queryKey: keys.accounts });
  };
  const connect = useMutation({
    mutationFn: async () => {
      const returnTo = `${window.location.origin}/settings`;
      const { url } = await callFunction<{ url: string }>('ebay-connect', { action: 'start', return_to: returnTo });
      window.location.assign(url);
    },
  });
  const settings = useMutation({
    mutationFn: (body: {
      postal_code?: string;
      country?: string;
      fulfillment_policy_id?: string;
      payment_policy_id?: string;
      return_policy_id?: string;
    }) => callFunction('ebay-connect', { action: 'settings', ...body }),
    onSuccess: refresh,
  });
  const disconnect = useMutation({
    mutationFn: () => callFunction('ebay-connect', { action: 'disconnect' }),
    onSuccess: refresh,
  });
  const sync = useMutation({
    mutationFn: () => callFunction<{ orders: number; sales: number }>('ebay-sync', { action: 'sync' }),
    onSuccess: () => {
      refresh();
      refreshItems(qc);
    },
  });
  const importListings = useMutation({
    mutationFn: () => callFunction<{ imported: number; skipped: number }>('ebay-sync', { action: 'import' }),
    onSuccess: () => refreshItems(qc),
  });
  return { connect, settings, disconnect, sync, importListings };
}
