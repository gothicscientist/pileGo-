# Switching on eBay for pilego.app

eBay is the one marketplace with an official seller API, so pileGo lists,
ends, relists, reprices and checks for sales on eBay from the server, even
when the browser is closed. To do that, the copy of pileGo at
[pilego.app](https://pilego.app) needs its own eBay developer keys. This page
covers getting them, step by step. It takes about 20 minutes, plus however
long eBay takes to approve the production keyset (usually minutes, sometimes
a day).

These are the addresses you will paste into eBay's portal. The project ref
`jobkhbfymwgyfadpmeqk` is pilego.app's Supabase project.

| What | Value |
|---|---|
| OAuth accepted URL | `https://jobkhbfymwgyfadpmeqk.supabase.co/functions/v1/ebay-connect` |
| OAuth declined URL | `https://jobkhbfymwgyfadpmeqk.supabase.co/functions/v1/ebay-connect` |
| Privacy policy URL | `https://pilego.app/privacy` |
| Account deletion endpoint | `https://jobkhbfymwgyfadpmeqk.supabase.co/functions/v1/ebay-account-deletion` |
| Account deletion verification token | `<I will give you this token>` |

## 1. Join the eBay Developers Program

1. Go to [developer.ebay.com](https://developer.ebay.com) and choose
   **Join**. Sign up with the email you want eBay's developer notices to go
   to. This is a developer account, separate from your eBay selling account,
   though you can use the same email.
2. Confirm the email eBay sends. Developer accounts can take up to a business
   day to be activated.

## 2. Create the production keyset

1. Signed in, open **My Account › Application Keysets** (also reachable from
   **Hi, name › Application Keysets**).
2. Enter an application title, for example `pileGo`, and choose **Create a
   keyset** under **Production**. (Not Sandbox: the sandbox has no real
   listings or orders.)
3. eBay shows the keyset and, before it can be used, asks you to deal with
   marketplace account deletion notifications. Do step 3 now; the keyset
   stays disabled until you do.

## 3. Set up account deletion notifications

eBay requires every production keyset to receive notices when an eBay user
deletes their account. pileGo has an endpoint for it that answers eBay's
check and, for a real notice, removes that eBay account's tokens.

1. Make sure the verification token is already on pilego.app's server (the
   coordinator sets `EBAY_VERIFICATION_TOKEN` before you start). eBay checks
   the endpoint the moment you save, and the check fails without it.
2. On the Application Keysets page, open **Notifications** next to the
   production App ID (eBay may show this as the **Alerts & Notifications**
   page, or prompt for it right after creating the keyset).
3. Choose **Marketplace Account Deletion**.
4. Fill in:
   - **Email to notify if marketplace account deletion notification
     endpoint is down:** your email.
   - **Marketplace account deletion notification endpoint:**
     `https://jobkhbfymwgyfadpmeqk.supabase.co/functions/v1/ebay-account-deletion`
   - **Verification token:** `<I will give you this token>`
5. Choose **Save**. eBay sends a challenge to the endpoint and shows a green
   tick when pileGo answers correctly.
6. Optional: choose **Send Test Notification**. pileGo answers 204 when the
   eBay keys are in place and the signature checks out.

Do not choose the "Not persisting eBay data" exemption: pileGo stores the
eBay username and tokens of every seller who connects.

## 4. Copy the App ID and Cert ID

Back on **Application Keysets**, the production keyset now shows:

- **App ID (Client ID)**: becomes `EBAY_CLIENT_ID`
- **Cert ID (Client Secret)**: becomes `EBAY_CLIENT_SECRET`

The Dev ID is not needed.

## 5. Add the redirect URL (RuName)

eBay does not redirect to a URL you pass at sign-in time. It redirects to a
URL saved here, which it names with an id called the RuName.

1. Next to the production App ID, choose **User Tokens**.
2. Under **Get a Token from eBay via Your Application**, choose **Add eBay
   Redirect URL**.
3. Fill in:
   - **Display title:** `pileGo`
   - **Your privacy policy URL:** `https://pilego.app/privacy`
   - **Your auth accepted URL:**
     `https://jobkhbfymwgyfadpmeqk.supabase.co/functions/v1/ebay-connect`
   - **Your auth declined URL:** the same address
4. Make sure **OAuth Enabled** is ticked (without it only the old
   Auth'n'Auth tokens work, which pileGo does not use).
5. **Save**. eBay shows the new **RuName (eBay Redirect URL name)**, a value
   that looks like `Your_Name-YourName-pileGo-abcdefg`. It is not a URL.
   This becomes `EBAY_RU_NAME`.

## 6. Put the keys on the server

Either send the three values to the person who runs pileGo's deploys, or add
them yourself in Supabase:

1. Open [the project's function secrets](https://supabase.com/dashboard/project/jobkhbfymwgyfadpmeqk/functions/secrets)
   (Supabase dashboard › Edge Functions › Secrets).
2. Add, with these exact names:

   | Name | Value |
   |---|---|
   | `EBAY_CLIENT_ID` | App ID from step 4 |
   | `EBAY_CLIENT_SECRET` | Cert ID from step 4 |
   | `EBAY_RU_NAME` | RuName from step 5 |
   | `EBAY_ENV` | `production` |

   `EBAY_VERIFICATION_TOKEN`, `PILEGO_APP_URL` and `PILEGO_ALLOWED_ORIGINS`
   are already set.
3. Save. Edge functions read secrets on their next start, within a minute.

From a clone of the repository the same can be done with:

```sh
SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=jobkhbfymwgyfadpmeqk \
EBAY_CLIENT_ID=… EBAY_CLIENT_SECRET=… EBAY_RU_NAME=… EBAY_ENV=production \
node scripts/deploy.mjs --only=secrets
```

To check what the server has, without revealing any value:

```sh
curl 'https://jobkhbfymwgyfadpmeqk.supabase.co/functions/v1/ebay-connect?setup=1'
```

It answers with `configured: true` once the three keys are in.

## 7. Connect your eBay seller account

On the selling side, eBay needs:

- An eBay account registered to sell, with payouts set up (Seller Hub asks
  for a bank account the first time you list).
- Business policies, which eBay has switched on for nearly every seller. If
  yours are off, pileGo turns them on the first time it lists; eBay can take
  up to an hour to finish.
- A **shipping policy** in Seller Hub › Account › Business policies. This
  sets what buyers pay for postage, so pileGo leaves it to you. pileGo
  creates simple payment and returns policies (30-day returns, buyer pays
  return postage) if you have none, and you can pick other ones in Settings.

Then, in pileGo:

1. Open **Settings › eBay** and choose **Connect eBay**. Sign in on eBay and
   choose **Agree**. eBay sends you back to Settings.
2. Enter the postcode your items ship from and choose **Save**.
3. Optional: pick the shipping, payment and returns policies to use.
4. Optional: **Import my eBay listings** brings your current eBay listings
   into the closet.

When an item goes out to eBay, pileGo picks the category from the title,
fills in the item specifics it knows (brand, size, colour, department, type,
style, material) and asks on the item's eBay listing for any that eBay
requires and it could not work out.

## Troubleshooting

**Connect eBay is missing in Settings.** The server does not have all three
keys yet. The checklist under "For whoever runs pileGo" shows which.

**eBay says "invalid_request" or "unauthorized_client" on the sign-in page.**
The RuName does not match the keyset (for example a sandbox RuName with
production keys), or OAuth Enabled is not ticked in step 5.

**The account deletion endpoint will not save.** `EBAY_VERIFICATION_TOKEN`
on the server must be exactly the token typed into eBay's form, and the
endpoint must be the address above with no trailing slash.

**A listing says "eBay needs …".** Fill in the item specifics shown on the
item's eBay listing and choose **Save and list again**.
