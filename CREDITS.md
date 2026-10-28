# Credits

pileGo builds on three earlier projects.

## Bumpline

Bumpline is a one-click relister for Vinted, by g1ampy, licensed GPL-3.0-or-later.
pileGo's Vinted engine is adapted from it:

- the main-world fetch bridge (`apps/extension/static/bridge.js`)
- the CSRF token and anon id lookups
- the headers Vinted's upload form sends
- the draft-then-complete publish flow
- the size handling
- the pacing and back-off rules

GPL-3.0-or-later code may be used in an AGPL-3.0-or-later project. The adapted
files carry Bumpline's copyright notice alongside pileGo's.

## eBayOS

eBayOS is an eBay listing tool with a Poshmark cross-lister. The extension's
Poshmark selectors are taken from its `poshmark-content.js`, and so is the
photos-first fill order.

## closet-to-cash

closet-to-cash is a closet inventory app. It informed pileGo's item model and
its scan, review and list flow.
