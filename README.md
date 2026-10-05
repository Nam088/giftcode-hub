# giftcode-hub

Collects public gift codes every day and redeems them from a Chrome extension (WXT + Svelte 5). It redeems codes you are allowed to use, one by one, by filling and clicking the official redeem page's own form. It does not call hidden APIs and does not bypass captchas.

## Supported sites

Each game and server is its own site, with its own code box, jobs, history, feed and processed codes, so nothing mixes between them.

| Site id | Game / server | Redeem page | Notes |
| --- | --- | --- | --- |
| `df-garena` | Delta Force · Garena (SEA) | `redeem.df.garena.sg/<lang>/cdkgarena.html` | Log in first |
| `df-global` | Delta Force · Global | `www.playdeltaforce.com/<lang>/cdkredeem.html` | Log in first; the UID form (Tencent captcha) is not used |

Adapters live in `src/lib/sites/<game>/<server>.ts` and are registered in `src/lib/sites/index.ts`. Delta Force result messages for all page languages are generated from the pages' own language files with `pnpm gen:df-messages`.

## Languages

The UI is available in Vietnamese and English (`src/lib/i18n`). It follows the browser language by default and can be changed in Settings. The extension name and context menu use `public/_locales`. A test makes sure every locale has the same keys and placeholders as English.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` | Build the extension into `.output/` |
| `pnpm browser` | Chrome for Testing with a persistent profile (`.chrome-profile/`) and the extension loaded |
| `pnpm capture [label]` | Save HTML, screenshot and form summary of the open redeem tab into `captures/` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm e2e` | Full run of the built extension against `tests/fixtures/redeemMock.html`; the real site is never contacted |
| `pnpm scrape` | Update `feed/<site>.json` from public code list pages |
| `pnpm gen:df-messages` | Regenerate Delta Force result messages from the redeem pages |
| `pnpm lint` / `pnpm check` | Biome and svelte-check |

## Daily code feed

`.github/workflows/scrape-codes.yml` runs `pnpm scrape` every day at 08:17 Vietnam time and commits the feeds only when a code list changed. There is one feed per site: `feed/df-garena.json` (Vietnamese sites) and `feed/df-global.json` (English sites).

Duplicates are handled in three layers:

1. **Feed**: one file per site, and each JSON is keyed by the code string, so a code listed by several sources or on several days is stored once (`firstSeen`, `lastSeen`, `sources`). Codes no source has listed for 180 days are pruned.
2. **Code box**: syncing only appends codes that are not already in the box.
3. **Account and site**: codes that already got a result on the logged in account of that site (stored as SHA 256 hashes) are skipped.

The repo is public so the extension can read the feeds for free. Paste the feed folder in the extension settings; each site appends its own file name:

```
https://raw.githubusercontent.com/Nam088/giftcode-hub/main/feed/
```

Sources live in `scripts/scrape/sources.ts`. Each run checks `robots.txt`, identifies itself with a clear user agent, fetches each page once with a pause between pages, and skips any site that refuses (403). Only the code strings are stored, not the articles.

Note: GitHub disables scheduled workflows in public repos after 60 days without repository activity. The daily feed commits normally keep it active; if a quiet period disables it, re-enable it from the Actions tab.

## Disclaimer

Not affiliated with Garena or the game publisher. Automating redemption may break the publisher's terms of service and can get an account restricted. Use only codes you are allowed to use, keep the default delay, and stop if the site shows a captcha or rate limit.
