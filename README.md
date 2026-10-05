# giftcode-hub

Collects public gift codes every day and redeems them from a Chrome extension. The first supported game is Delta Force (Garena); more sites and games can be added as new sources and site adapters.

The Chrome extension (WXT + Svelte 5) redeems gift codes you are allowed to use on the official Garena redeem page, one by one, by filling and clicking the page's own form. It does not call hidden APIs and does not bypass captchas.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Build the extension into `.output/` |
| `pnpm browser` | Chrome for Testing with a persistent profile (`.chrome-profile/`) and the extension loaded |
| `pnpm capture [label]` | Save HTML, screenshot and form summary of the open redeem tab into `captures/` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm e2e` | Full run of the built extension against `tests/fixtures/redeemMock.html`; the real site is never contacted |
| `pnpm scrape` | Update `feed/codes.json` from public code list pages |
| `pnpm lint` / `pnpm check` | Biome and svelte-check |

## Daily code feed

`.github/workflows/scrape-codes.yml` runs `pnpm scrape` every day at 08:17 Vietnam time and commits `feed/codes.json` only when the code list changed.

Duplicates are handled in three layers:

1. **Feed**: the JSON is keyed by the code string, so a code listed by several sources or on several days is stored once (`firstSeen`, `lastSeen`, `sources`). Codes no source has listed for 180 days are pruned.
2. **Code box**: syncing only appends codes that are not already in the box.
3. **Account**: codes that already got a result on the logged in account (stored as SHA 256 hashes) are skipped.

The repo is public so the extension can read the feed for free. Paste this URL in the extension settings:

```
https://raw.githubusercontent.com/Nam088/giftcode-hub/main/feed/codes.json
```

Sources live in `scripts/scrape/sources.ts`. Each run checks `robots.txt`, identifies itself with a clear user agent, fetches each page once with a pause between pages, and skips any site that refuses (403). Only the code strings are stored, not the articles.

Note: GitHub disables scheduled workflows in public repos after 60 days without repository activity. The daily feed commits normally keep it active; if a quiet period disables it, re-enable it from the Actions tab.

## Disclaimer

Not affiliated with Garena or the game publisher. Automating redemption may break the publisher's terms of service and can get an account restricted. Use only codes you are allowed to use, keep the default delay, and stop if the site shows a captcha or rate limit.
