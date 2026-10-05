<script lang="ts">
import { onMount } from 'svelte';
import type { MessageKey } from '@/lib/i18n/en';
import { t } from '@/lib/i18n/index.svelte';
import { SITES } from '@/lib/sites';
import { runner } from './runner.svelte';
import HistoryTab from './tabs/HistoryTab.svelte';
import RedeemTab from './tabs/RedeemTab.svelte';
import ResultsTab from './tabs/ResultsTab.svelte';
import SettingsTab from './tabs/SettingsTab.svelte';

type TabId = 'redeem' | 'results' | 'history' | 'settings';

const TABS: { id: TabId; label: MessageKey; icon: string }[] = [
  {
    id: 'redeem',
    label: 'tab.redeem',
    icon: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z',
  },
  { id: 'results', label: 'tab.results', icon: 'M4 6h16M4 12h16M4 18h10' },
  {
    id: 'history',
    label: 'tab.history',
    icon: 'M12 7v5l3 2M21 12a9 9 0 1 1-9-9a9 9 0 0 1 9 9z',
  },
  { id: 'settings', label: 'tab.settings', icon: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4' },
];

let active = $state<TabId>('redeem');
let ready = $state(false);

onMount(async () => {
  await runner.init();
  ready = true;
});

const probe = $derived(runner.probe);
const connection = $derived(
  probe?.loggedIn
    ? { tone: 'ok', text: probe.account || t('conn.loggedIn') }
    : probe
      ? { tone: 'warn', text: t('conn.notLoggedIn') }
      : { tone: 'off', text: runner.tabError ? t(runner.tabError) : t('conn.checking') },
);
const resultBadge = $derived(runner.job ? runner.job.items.length : 0);
const needsReview = $derived(runner.counts.unknown > 0);
const siteLocked = $derived(runner.runningSite !== undefined);
</script>

<div class="flex min-h-screen flex-col">
  <!-- Header -->
  <header class="sticky top-0 z-10 border-b border-df-line bg-df-bg/95 backdrop-blur">
    <div class="flex items-center justify-between px-3 pt-3 pb-2">
      <div class="flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="h-6 w-6 text-df-accent" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M12 2l9 5v10l-9 5l-9-5V7z" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        <div class="leading-none">
          <div class="text-sm font-bold tracking-[0.2em] uppercase">{t('app.title')}</div>
          <div class="text-[9px] tracking-[0.35em] text-df-dim uppercase">{t('app.subtitle')}</div>
        </div>
      </div>

      <button
        class="flex items-center gap-1.5 border px-2 py-1 text-[10px] tracking-wider uppercase {connection.tone === 'ok'
          ? 'border-df-accent/40 text-df-accent'
          : connection.tone === 'warn'
            ? 'border-df-warn/40 text-df-warn'
            : 'border-df-line text-df-dim'}"
        title={t('app.openRedeem')}
        onclick={() => runner.openRedeemPage()}
      >
        <span
          class="h-1.5 w-1.5 {connection.tone === 'ok'
            ? 'bg-df-accent shadow-[0_0_6px_#0ff796]'
            : connection.tone === 'warn'
              ? 'bg-df-warn'
              : 'bg-df-dim'}"
        ></span>
        <span class="max-w-28 truncate">{connection.text}</span>
      </button>
    </div>

    <!-- Game and server: everything below is scoped to this choice -->
    <div class="px-3 pb-2">
      <label class="sr-only" for="site-select">{t('site.label')}</label>
      <select
        id="site-select"
        class="hud-input px-2 py-1 text-xs font-semibold tracking-wider uppercase disabled:opacity-50"
        value={runner.settings.activeSite}
        disabled={siteLocked}
        title={siteLocked ? t('site.locked') : t('site.label')}
        onchange={(event) => runner.setSite(event.currentTarget.value as typeof runner.settings.activeSite)}
      >
        {#each SITES as site (site.id)}
          <option value={site.id}>{t(`site.${site.id}`)}</option>
        {/each}
      </select>
    </div>

    <!-- Tabs -->
    <nav class="flex">
      {#each TABS as tab (tab.id)}
        <button
          class="group relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold tracking-[0.14em] uppercase transition-colors {active ===
          tab.id
            ? 'text-df-accent'
            : 'text-df-dim hover:text-df-text'}"
          onclick={() => (active = tab.id)}
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d={tab.icon} />
          </svg>
          <span>{t(tab.label)}</span>
          {#if tab.id === 'results' && resultBadge}
            <span
              class="absolute top-1 right-2 min-w-4 px-1 text-[9px] leading-4 {needsReview
                ? 'bg-df-warn text-black'
                : 'bg-df-panel-2 text-df-muted'}">{resultBadge}</span
            >
          {/if}
          <span
            class="absolute inset-x-2 bottom-0 h-0.5 transition-all {active === tab.id
              ? 'bg-df-accent shadow-[0_0_8px_#0ff796]'
              : 'bg-transparent'}"
          ></span>
        </button>
      {/each}
    </nav>
  </header>

  <main class="flex flex-1 flex-col gap-3 p-3">
    {#if !ready}
      <div class="hud-label py-10 text-center">{t('app.loading')}</div>
    {:else if active === 'redeem'}
      <RedeemTab onShowResults={() => (active = 'results')} />
    {:else if active === 'results'}
      <ResultsTab />
    {:else if active === 'history'}
      <HistoryTab />
    {:else}
      <SettingsTab />
    {/if}
  </main>

  <footer class="border-t border-df-line px-3 py-2 text-center text-[9px] tracking-widest text-df-dim uppercase">
    {t('app.footer')}
  </footer>
</div>
