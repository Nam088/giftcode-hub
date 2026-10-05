<script lang="ts">
import { downloadText } from '@/lib/export';
import {
  errorText,
  formatDateTime,
  LOCALE_NAMES,
  LOCALES,
  type LocalePreference,
  t,
  tm,
} from '@/lib/i18n/index.svelte';
import { knownKey, MIN_DELAY_MS } from '@/lib/storage';
import Toggle from '../components/Toggle.svelte';
import { runner } from '../runner.svelte';

let confirmWipe = $state(false);
let backupMessage = $state('');
let backupError = $state(false);
let backupInput: HTMLInputElement | undefined = $state();
let feedBaseUrl = $state(runner.settings.feedBaseUrl);
let feedMessage = $state('');

function exportBackup() {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(
    `gift-code-backup_${stamp}.json`,
    JSON.stringify(runner.exportBackup(), null, 2),
    'application/json',
  );
}

async function importBackup(event: Event & { currentTarget: HTMLInputElement }) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  if (!file) return;
  try {
    backupMessage = tm(await runner.importBackup(await file.text()));
    backupError = false;
  } catch (error) {
    backupMessage = errorText(error);
    backupError = true;
  }
}

async function saveFeed() {
  await runner.saveSettings({ feedBaseUrl: feedBaseUrl.trim() });
  feedMessage = feedBaseUrl.trim() ? tm(await runner.syncFeed()) : t('settings.feedOff');
}

const LANGUAGE_OPTIONS: LocalePreference[] = ['auto', ...LOCALES];
const lastSync = $derived(runner.feedSync ? formatDateTime(runner.feedSync.at) : '');
const delaySeconds = $derived(runner.settings.delayMs / 1000);
const account = $derived(runner.probe?.account ?? '');
const hasKnown = $derived(!!runner.known[knownKey(runner.site.id, account)]);
const running = $derived(!!runner.runningSite);
</script>

<section class="hud-panel p-3">
  <label class="hud-label mb-1.5 block" for="language">{t('settings.language')}</label>
  <select
    id="language"
    class="hud-input px-2 py-1.5 text-sm"
    value={runner.settings.locale}
    onchange={(event) => runner.setLanguage(event.currentTarget.value as LocalePreference)}
  >
    {#each LANGUAGE_OPTIONS as option (option)}
      <option value={option}>{option === 'auto' ? t('settings.languageAuto') : LOCALE_NAMES[option]}</option>
    {/each}
  </select>
</section>

<section class="hud-panel p-3">
  <div class="hud-label mb-1">{t('settings.speed')}</div>
  <div class="flex items-center justify-between py-2">
    <span class="text-sm">{t('settings.delay')}</span>
    <span class="glow-text font-mono text-sm">{delaySeconds}s</span>
  </div>
  <input
    type="range"
    class="w-full accent-df-accent"
    min={MIN_DELAY_MS / 1000}
    max="20"
    step="0.5"
    value={delaySeconds}
    oninput={(event) => runner.saveSettings({ delayMs: Math.round(Number(event.currentTarget.value) * 1000) })}
  />
  <p class="mt-1 text-[11px] text-df-dim">{t('settings.delayHint', { min: MIN_DELAY_MS / 1000 })}</p>
</section>

<section class="hud-panel divide-y divide-df-line px-3 py-1">
  <Toggle
    label={t('settings.allowBackground')}
    hint={t('settings.allowBackgroundHint')}
    checked={runner.settings.allowBackground}
    onchange={(value) => runner.saveSettings({ allowBackground: value })}
  />
  <Toggle
    label={t('settings.skipKnown')}
    hint={t('settings.skipKnownHint')}
    checked={runner.settings.skipKnown}
    onchange={(value) => runner.saveSettings({ skipKnown: value })}
  />
  <Toggle
    label={t('settings.mask')}
    hint={t('settings.maskHint')}
    checked={runner.settings.maskFinishedCodes}
    onchange={(value) => runner.saveSettings({ maskFinishedCodes: value })}
  />
  <Toggle
    label={t('settings.notify')}
    hint={t('settings.notifyHint')}
    checked={runner.settings.notify}
    onchange={(value) => runner.saveSettings({ notify: value })}
  />
</section>

<section class="hud-panel flex flex-col gap-2 p-3">
  <div class="hud-label">{t('settings.feed')}</div>
  <p class="text-[11px] text-df-dim">
    {t('settings.feedHint', { file: `${runner.site.feedKey}.json` })}
  </p>
  <input
    class="hud-input px-2 py-1.5 font-mono text-xs"
    type="url"
    placeholder="https://raw.githubusercontent.com/…/feed/"
    bind:value={feedBaseUrl}
  />
  <button class="btn btn-ghost w-full" onclick={saveFeed}>{t('settings.feedSave')}</button>
  {#if feedMessage}<p class="text-[11px] text-df-accent">{feedMessage}</p>{/if}
  {#if lastSync && runner.feedSync}
    <p class="text-[11px] text-df-dim">
      {t('settings.feedLast', { time: lastSync, active: runner.feedSync.active, added: runner.feedSync.added })}
    </p>
  {/if}
</section>

<section class="hud-panel divide-y divide-df-line px-3 py-1">
  <Toggle
    label={t('settings.autoSync')}
    hint={t('settings.autoSyncHint')}
    checked={runner.settings.autoSyncFeed}
    onchange={(value) => runner.saveSettings({ autoSyncFeed: value })}
  />
</section>

<section class="hud-panel flex flex-col gap-2 p-3">
  <div class="hud-label">{t('settings.data')}</div>
  <div class="grid grid-cols-2 gap-2">
    <button class="btn btn-ghost" onclick={exportBackup}>{t('settings.backup')}</button>
    <button class="btn btn-ghost" onclick={() => backupInput?.click()}>{t('settings.restore')}</button>
  </div>
  <input
    bind:this={backupInput}
    type="file"
    accept=".json,application/json"
    class="hidden"
    onchange={importBackup}
  />
  <p class="text-[11px] text-df-dim">{t('settings.backupHint')}</p>
  {#if backupMessage}
    <p class="text-[11px] {backupError ? 'text-df-danger' : 'text-df-accent'}">{backupMessage}</p>
  {/if}
  <button class="btn btn-ghost w-full" disabled={!hasKnown} onclick={() => runner.forgetKnown(account)}>
    {t('settings.forget', { account: account || t('settings.currentAccount') })}
  </button>
  {#if confirmWipe}
    <div class="flex gap-2">
      <button
        class="btn btn-danger flex-1"
        disabled={running}
        onclick={async () => {
          await runner.wipeAll();
          confirmWipe = false;
        }}
      >
        {t('settings.wipeConfirm')}
      </button>
      <button class="btn btn-ghost" onclick={() => (confirmWipe = false)}>{t('settings.cancel')}</button>
    </div>
  {:else}
    <button class="btn btn-danger w-full" disabled={running} onclick={() => (confirmWipe = true)}>
      {t('settings.wipe')}
    </button>
  {/if}
  <p class="text-[11px] text-df-dim">{t('settings.local')}</p>
</section>

<section class="hud-panel p-3 text-[11px] leading-relaxed text-df-dim">
  <div class="hud-label mb-1">{t('settings.notice')}</div>
  {t('settings.noticeBody')}
</section>
