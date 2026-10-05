<script lang="ts">
import type { MessageKey } from '@/lib/i18n/en';
import { formatDateTime, t } from '@/lib/i18n/index.svelte';
import { DEFAULT_SITE, isSiteId } from '@/lib/sites';
import { parseKnownKey } from '@/lib/storage';
import { runner } from '../runner.svelte';

// History and processed codes of the selected game and server only
const history = $derived(
  runner.history.filter((h) => (h.siteId ?? DEFAULT_SITE) === runner.site.id),
);

const accounts = $derived(
  Object.entries(runner.known)
    .map(([key, codes]) => ({ ...parseKnownKey(key), codes: Object.values(codes) }))
    .filter((row) => isSiteId(row.siteId) && row.siteId === runner.site.id)
    .map((row) => ({
      account: row.account || t('history.unknownAccount'),
      total: row.codes.length,
      success: row.codes.filter((s) => s === 'success').length,
    })),
);

const totals = $derived(
  history.reduce(
    (acc, h) => ({
      runs: acc.runs + 1,
      success: acc.success + h.counts.success,
      codes: acc.codes + h.total,
    }),
    { runs: 0, success: 0, codes: 0 },
  ),
);

const STATS: [MessageKey, 'runs' | 'codes' | 'success'][] = [
  ['history.runs', 'runs'],
  ['history.sent', 'codes'],
  ['history.success', 'success'],
];

function duration(start: number, end: number) {
  const s = Math.round((end - start) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}
</script>

<section class="grid grid-cols-3 gap-1.5">
  {#each STATS as [label, field] (field)}
    <div class="hud-panel px-2 py-2">
      <div class="text-[9px] tracking-widest text-df-dim uppercase">{t(label)}</div>
      <div class="text-xl font-semibold {field === 'success' ? 'glow-text' : ''}">{totals[field]}</div>
    </div>
  {/each}
</section>

<section class="hud-panel p-3">
  <div class="hud-label mb-2">{t('history.recent')}</div>
  {#if history.length === 0}
    <p class="text-xs text-df-dim">{t('history.none')}</p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each history as entry (entry.id)}
        {@const failed = entry.counts.invalid + entry.counts.expired}
        <li class="border border-df-line bg-black/20 p-2">
          <div class="flex items-center justify-between text-[11px] text-df-dim">
            <span>{formatDateTime(entry.finishedAt)} · {entry.account || 'N/A'}</span>
            <span>{t(entry.mode === 'auto' ? 'mode.auto' : 'mode.semi')} · {duration(entry.startedAt, entry.finishedAt)}</span>
          </div>
          <div class="mt-1.5 flex h-1.5 overflow-hidden bg-white/5">
            <span class="bg-df-accent" style="width: {(entry.counts.success / entry.total) * 100}%"></span>
            <span class="bg-df-muted/50" style="width: {(entry.counts.used / entry.total) * 100}%"></span>
            <span class="bg-df-danger/70" style="width: {(failed / entry.total) * 100}%"></span>
            <span class="bg-df-warn/70" style="width: {(entry.counts.unknown / entry.total) * 100}%"></span>
          </div>
          <div class="mt-1 text-xs text-df-dim">
            {t('history.entry', {
              success: entry.counts.success,
              used: entry.counts.used,
              failed,
              unknown: entry.counts.unknown,
              pending: entry.counts.pending,
            })}
          </div>
        </li>
      {/each}
    </ul>
    <button class="btn btn-ghost mt-3 w-full" onclick={() => runner.clearHistory()}>{t('history.clear')}</button>
  {/if}
</section>

<section class="hud-panel p-3">
  <div class="hud-label mb-2">{t('history.known')}</div>
  <p class="mb-2 text-[11px] text-df-dim">{t('history.knownHint')}</p>
  {#if accounts.length === 0}
    <p class="text-xs text-df-dim">{t('history.noData')}</p>
  {:else}
    <ul class="flex flex-col gap-1">
      {#each accounts as row (row.account)}
        <li class="flex items-center justify-between border border-df-line bg-black/20 px-2 py-1.5 text-xs">
          <span>{row.account}</span>
          <span class="text-df-dim">{t('history.knownRow', { total: row.total, success: row.success })}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>
