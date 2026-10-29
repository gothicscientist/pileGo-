import { MARKETPLACES, type MarketplaceId } from '@pilego/core';

export function SellerLoginReminder({ markets }: { markets: MarketplaceId[] }) {
  const sellers = markets.filter(m => ['extension', 'assist'].includes(MARKETPLACES[m].capabilities.create));
  if (!sellers.length) return null;
  return (
    <aside className="rounded-xl bg-paper-2 p-3 text-sm text-ink-2" aria-label="Before listing with the extension">
      <p><strong className="text-ink">Log in to your seller websites first.</strong> Use this same browser and browser profile. A tab being open does not mean you are signed in. Finish any seller setup or verification the site asks for.</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {sellers.map(m => <a key={m} href={MARKETPLACES[m].sell_url} target="_blank" rel="noreferrer" className="font-semibold underline">Open {MARKETPLACES[m].name}</a>)}
      </div>
    </aside>
  );
}

