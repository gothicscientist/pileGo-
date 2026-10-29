import { Link } from 'react-router';
import { Wordmark } from '~/app/Shell';

// Plain-language privacy notes. eBay asks for a privacy policy URL before it
// turns on production API keys, so this page is public.

export function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link to="/">
        <Wordmark />
      </Link>
      <article className="mt-10 flex flex-col gap-5 leading-relaxed text-ink-2 [&_h2]:font-display [&_h2]:mt-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-ink">
        <h1 className="font-display text-5xl leading-none font-semibold text-ink">Privacy notes</h1>
        <p>
          pileGo! is free, open-source software for selling secondhand clothes. Whoever runs a copy of pileGo! is responsible for
          the data in it. These notes describe what the software stores and where it sends it.
        </p>

        <h2>What pileGo! stores</h2>
        <ul className="list-disc pl-5">
          <li>Your email address, to sign you in with a link.</li>
          <li>The items you add: photos, titles, descriptions, prices, sizes, measurements and notes.</li>
          <li>Your listings on each marketplace: their ids, links, prices and status.</li>
          <li>Sales: the price, the date and the marketplace. Buyer names and addresses are not stored.</li>
          <li>Settings such as your currency, region, writing style and fee overrides.</li>
        </ul>

        <h2>Marketplace connections</h2>
        <p>
          When you connect eBay, eBay gives pileGo! an access token for your account. The token is stored server-side in a table
          that only the server can read. It is used to create, end and update your listings and to read your orders so sold
          items are taken down elsewhere. You can disconnect in Settings, which deletes the token.
        </p>
        <p>
          For Vinted, Depop, Poshmark, Mercari and Grailed, the optional browser extension works inside
          tabs where you are already logged in. Your marketplace passwords and cookies never leave your browser and are never
          sent to pileGo! When you check an item’s price, the extension also opens eBay’s public search for similar sold items
          in your browser and hands their titles, prices and links back to pileGo! for the price check.
        </p>

        <h2>AI scanning</h2>
        <p>
          When you scan an item, its photos are sent to the AI provider configured by whoever runs this copy (Google Gemini by
          default) to describe the garment. pileGo! does not use photos for anything else.
        </p>

        <h2>Who can see your data</h2>
        <p>
          Every row in the database is locked to your account with row-level security, so other users cannot read it. Photos sit
          in a private storage bucket and load through short-lived links.
        </p>

        <h2>Deleting your data</h2>
        <p>
          Deleting an item deletes its photos and listings records. To delete your whole account, contact whoever runs this copy
          of pileGo!, or, if you run it yourself, delete the user in your Supabase dashboard; everything linked to it is removed
          with it.
        </p>

        <h2>Cookies and tracking</h2>
        <p>pileGo! uses your browser’s storage to keep you signed in. It has no analytics, ads or third-party trackers.</p>
      </article>
    </div>
  );
}

