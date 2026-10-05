<script lang="ts">
import { codesFromFile, maskCode, parseCodes } from '@/lib/codes';
import type { MessageKey } from '@/lib/i18n/en';
import { type Msg, t, tm } from '@/lib/i18n/index.svelte';
import type { RunMode } from '@/lib/job';
import { STATUS_ORDER } from '@/lib/labels';
import { runner } from '../runner.svelte';

let { onShowResults }: { onShowResults: () => void } = $props();

let ownsCodes = $state(false);
let startError = $state<Msg | null>(null);
let starting = $state(false);
let confirmStop = $state(false);
let split = $state<{ fresh: string[]; known: string[] }>({ fresh: [], known: [] });
let fileInput: HTMLInputElement | undefined = $state();
let feedMessage = $state<Msg | null>(null);

async function pullFeed() {
  feedMessage = await runner.syncFeed();
}

// Parse everything so invalid and duplicates are separated cleanly
const parsed = $derived(parseCodes(runner.draft, runner.site.codeFormat, Number.POSITIVE_INFINITY));
const account = $derived(runner.probe?.account ?? '');
const candidates = $derived(runner.settings.skipKnown ? split.fresh : parsed.valid);
const toRun = $derived(candidates);
const nextBatch = $derived<string[]>([]);
const remaining = $derived(runner.job?.status === 'done' ? runner.counts.pending : 0);

$effect(() => {
  const codes = parsed.valid;
  const acc = account;
  // Recompute when the known list or the site changes too
  void runner.known;
  void runner.site.id;
  let cancelled = false;
  runner.splitKnown(codes, acc).then((result) => {
    if (!cancelled) split = result;
  });
  return () => {
    cancelled = true;
  };
});

// Messages belong to the site they were shown for
$effect(() => {
  void runner.site.id;
  feedMessage = null;
  startError = null;
});

const job = $derived(runner.job);
const done = $derived(
  runner.counts.success +
    runner.counts.used +
    runner.counts.invalid +
    runner.counts.expired +
    runner.counts.unknown,
);
const total = $derived(job?.items.length ?? 0);
const percent = $derived(total ? Math.round((done / total) * 100) : 0);
const current = $derived(
  job && runner.currentIndex >= 0 ? job.items[runner.currentIndex]?.code : undefined,
);

async function start() {
  starting = true;
  startError = null;
  const codes = [...toRun];
  const error = await runner.start(codes);
  starting = false;
  if (error) {
    startError = error;
    return;
  }
  await runner.setDraft('', true);
  ownsCodes = false;
}

async function continueRemaining() {
  startError = await runner.continueRemaining();
}

async function importFile(event: Event & { currentTarget: HTMLInputElement }) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  if (!file) return;
  const text = codesFromFile(await file.text());
  await runner.setDraft([runner.draft.trimEnd(), text.trim()].filter(Boolean).join('\n'), true);
}

async function stop() {
  confirmStop = false;
  await runner.stop();
}

const MODES: [RunMode, MessageKey, MessageKey][] = [
  ['auto', 'mode.auto', 'mode.autoHint'],
  ['semi', 'mode.semi', 'mode.semiHint'],
];

const SEGMENTS = 40;
</script>

{#if job && job.status !== 'done'}
  <!-- Active operation -->
  <section class="hud-panel flex flex-col gap-3 p-3">
    <div class="flex items-center justify-between">
      <span class="hud-label">{t('redeem.progress')}</span>
      <span class="text-[10px] tracking-widest text-df-dim uppercase">{job.account || 'N/A'}</span>
    </div>

    <div class="grid grid-cols-2 gap-1">
      {#each MODES as [value, label, hint] (value)}
        <button
          class="chamfer-frame px-2 py-1 text-left {job.mode === value
            ? 'is-active text-df-accent'
            : 'text-df-muted hover:text-df-text'}"
          onclick={() => runner.setMode(value)}
        >
          <div class="text-[11px] font-bold tracking-wider uppercase">{t(label)}</div>
          <div class="text-[10px] opacity-75">{t(hint)}</div>
        </button>
      {/each}
    </div>

    <div class="flex items-end justify-between">
      <span class="glow-text text-4xl leading-none font-bold">{percent}<span class="text-lg">%</span></span>
      <span class="font-mono text-sm text-df-muted">{done} / {total}</span>
    </div>

    <div class="flex gap-[2px]" aria-hidden="true">
      {#each Array(SEGMENTS) as _, i (i)}
        <span
          class="h-2 flex-1 {i < Math.round((percent / 100) * SEGMENTS)
            ? 'bg-df-accent shadow-[0_0_6px_rgba(15,247,150,0.6)]'
            : 'bg-white/8'}"
        ></span>
      {/each}
    </div>

    <div class="grid grid-cols-3 gap-1.5">
      {#each STATUS_ORDER as status (status)}
        <div class="border border-df-line bg-black/25 px-2 py-1.5">
          <div class="text-[9px] tracking-widest text-df-dim uppercase">{t(`status.${status}`)}</div>
          <div
            class="text-lg leading-tight font-semibold {status === 'success'
              ? 'text-df-accent'
              : status === 'unknown' && runner.counts.unknown > 0
                ? 'text-df-warn'
                : 'text-df-text'}"
          >
            {runner.counts[status]}
          </div>
        </div>
      {/each}
    </div>

    {#if job.status === 'running'}
      <div class="flex items-center gap-2 border border-df-accent/30 bg-df-accent/5 px-2 py-2 text-xs">
        <span class="h-2 w-2 shrink-0 animate-pulse bg-df-accent"></span>
        {#if runner.waitingForUser}
          <span>{t('redeem.waiting', { code: current ? maskCode(current) : '' })}</span>
        {:else if current}
          <span>{t('redeem.sending', { code: maskCode(current) })}</span>
        {:else if runner.countdownMs > 0}
          <span>{t('redeem.nextIn', { seconds: Math.ceil(runner.countdownMs / 1000) })}</span>
        {:else}
          <span>{t('redeem.running')}</span>
        {/if}
      </div>
    {:else if job.pauseReason}
      <div class="border border-df-warn/40 bg-df-warn/10 px-2 py-2 text-xs text-df-warn">
        <div class="font-semibold">{t(`pause.${job.pauseReason}`)}</div>
        {#if job.pauseNote}<div class="mt-0.5 text-df-muted">{t(job.pauseNote)}</div>{/if}
        {#if job.pauseDetail}<div class="mt-0.5 text-df-muted">{job.pauseDetail}</div>{/if}
      </div>
    {/if}

    <div class="flex gap-2">
      {#if job.status === 'running'}
        <button class="btn btn-ghost flex-1" onclick={() => runner.pause()}>{t('redeem.pause')}</button>
      {:else}
        <button class="btn btn-primary flex-1" disabled={!!runner.runningSite} onclick={() => runner.resume()}>
          {t('redeem.resume')}
        </button>
      {/if}
      {#if confirmStop}
        <button class="btn btn-danger" onclick={stop}>{t('redeem.confirmStop')}</button>
        <button class="btn btn-ghost" onclick={() => (confirmStop = false)}>{t('redeem.no')}</button>
      {:else}
        <button class="btn btn-danger" onclick={() => (confirmStop = true)}>{t('redeem.stop')}</button>
      {/if}
    </div>
    <button class="text-xs tracking-wider text-df-dim uppercase hover:text-df-accent" onclick={onShowResults}>
      {t('redeem.viewResults')}
    </button>
  </section>
{:else}
  {#if job?.status === 'done'}
    <section class="hud-panel flex flex-col gap-2 p-3 text-xs">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="hud-label">{t('redeem.lastRun')}</div>
          <div class="mt-1">
            {t('redeem.lastSummary', {
              success: runner.counts.success,
              used: runner.counts.used,
              failed: runner.counts.invalid + runner.counts.expired,
            })}
            {#if runner.counts.unknown}
              · <span class="text-df-warn">{t('redeem.toReview', { count: runner.counts.unknown })}</span>
            {/if}
          </div>
        </div>
        <button class="btn btn-ghost" onclick={onShowResults}>{t('redeem.view')}</button>
      </div>
      {#if remaining > 0}
        <button class="btn btn-primary w-full" disabled={!runner.probe?.loggedIn} onclick={continueRemaining}>
          {t('redeem.continue', { count: remaining })}
        </button>
      {/if}
    </section>
  {/if}

  <section class="hud-panel flex flex-col gap-3 p-3">
    <div class="flex items-center justify-between">
      <span class="hud-label">{t('redeem.input')}</span>
      <div class="flex items-center gap-1">
        {#if runner.settings.feedBaseUrl}
          <button class="btn btn-ghost px-2 py-1 text-[10px]" disabled={runner.feedBusy} onclick={pullFeed}>
            {runner.feedBusy ? t('redeem.pulling') : t('redeem.pullFeed')}
          </button>
        {/if}
        <button class="btn btn-ghost px-2 py-1 text-[10px]" onclick={() => fileInput?.click()}>
          {t('redeem.importFile')}
        </button>
        {#if runner.draft}
          <button class="btn btn-ghost px-2 py-1 text-[10px]" onclick={() => runner.setDraft('', true)}>
            {t('redeem.clear')}
          </button>
        {/if}
      </div>
      <input
        bind:this={fileInput}
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        class="hidden"
        onchange={importFile}
      />
    </div>

    <textarea
      class="hud-input h-40 resize-y p-2 font-mono text-xs leading-relaxed"
      placeholder={t('redeem.placeholder')}
      spellcheck="false"
      value={runner.draft}
      oninput={(event) => runner.setDraft(event.currentTarget.value)}
    ></textarea>
    {#if feedMessage}<p class="-mt-2 text-[11px] text-df-accent">{tm(feedMessage)}</p>{/if}
    <p class="-mt-2 text-[10px] text-df-dim">{t('redeem.tip')}</p>

    <div class="flex flex-wrap gap-1.5 text-[11px]">
      <span class="border border-df-accent/40 bg-df-accent/10 px-1.5 py-0.5 text-df-accent">
        {t('redeem.willRun', { count: toRun.length })}
      </span>
      {#if runner.settings.skipKnown && split.known.length}
        <span class="border border-df-line-strong px-1.5 py-0.5 text-df-muted">
          {t('redeem.skipped', { count: split.known.length })}
        </span>
      {/if}
      {#if parsed.duplicates.length}
        <span class="border border-df-line-strong px-1.5 py-0.5 text-df-muted">
          {t('redeem.duplicates', { count: parsed.duplicates.length })}
        </span>
      {/if}
      {#if parsed.invalid.length}
        <span class="border border-df-danger/40 px-1.5 py-0.5 text-df-danger">
          {t('redeem.badFormat', { count: parsed.invalid.length })}
        </span>
      {/if}
      {#if nextBatch.length}
        <span class="border border-df-warn/40 px-1.5 py-0.5 text-df-warn">
          {t('redeem.nextBatch', { count: nextBatch.length })}
        </span>
      {/if}
    </div>

    <div>
      <div class="hud-label mb-1.5">{t('mode.label')}</div>
      <div class="grid grid-cols-2 gap-1">
        {#each MODES as [value, label, hint] (value)}
          <button
            class="chamfer-frame px-2 py-1.5 text-left {runner.settings.mode === value
              ? 'is-active text-df-accent'
              : 'text-df-muted hover:text-df-text'}"
            onclick={() => runner.setMode(value)}
          >
            <div class="text-xs font-bold tracking-wider uppercase">{t(label)}</div>
            <div class="text-[10px] opacity-75">{t(hint)}</div>
          </button>
        {/each}
      </div>
    </div>

    <label class="flex items-start gap-2 text-xs text-df-muted">
      <input type="checkbox" class="mt-0.5 accent-df-accent" bind:checked={ownsCodes} />
      {t('redeem.owns')}
    </label>

    {#if startError}<p class="text-xs text-df-danger">{tm(startError)}</p>{/if}

    <button
      class="btn btn-primary w-full py-2.5 text-sm"
      disabled={!ownsCodes || toRun.length === 0 || !runner.probe?.loggedIn || starting || !!runner.runningSite}
      onclick={start}
    >
      {toRun.length ? t('redeem.start', { count: toRun.length }) : t('redeem.startEmpty')}
    </button>
  </section>
{/if}
