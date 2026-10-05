<script lang="ts">
import { codesFromFile, MAX_CODES_PER_BATCH, maskCode, parseCodes } from '@/lib/codes';
import type { RunMode } from '@/lib/job';
import { PAUSE_LABEL, STATUS_LABEL, STATUS_ORDER } from '@/lib/labels';
import { garenaDf } from '@/lib/sites/garenaDf';
import { runner } from '../runner.svelte';

let { onShowResults }: { onShowResults: () => void } = $props();

let ownsCodes = $state(false);
let startError = $state('');
let starting = $state(false);
let confirmStop = $state(false);
let split = $state<{ fresh: string[]; known: string[] }>({ fresh: [], known: [] });
let fileInput: HTMLInputElement | undefined = $state();
let feedMessage = $state('');

async function pullFeed() {
  feedMessage = await runner.syncFeed();
}

// Parse everything first so skipped known codes do not eat into the batch limit
const parsed = $derived(parseCodes(runner.draft, garenaDf.codeFormat, Number.POSITIVE_INFINITY));
const account = $derived(runner.probe?.account ?? '');
const candidates = $derived(runner.settings.skipKnown ? split.fresh : parsed.valid);
const toRun = $derived(candidates.slice(0, MAX_CODES_PER_BATCH));
const nextBatch = $derived(candidates.slice(MAX_CODES_PER_BATCH));
const remaining = $derived(runner.job?.status === 'done' ? runner.counts.pending : 0);

$effect(() => {
  const codes = parsed.valid;
  const acc = account;
  // Recompute when the known list changes too
  void runner.known;
  let cancelled = false;
  runner.splitKnown(codes, acc).then((result) => {
    if (!cancelled) split = result;
  });
  return () => {
    cancelled = true;
  };
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
  startError = '';
  const codes = [...toRun];
  const rest = [...nextBatch];
  const error = await runner.start(codes);
  starting = false;
  if (error) {
    startError = error;
    return;
  }
  // Keep only codes that did not fit in this batch, ready for the next one
  await runner.setDraft(rest.join('\n'), true);
  ownsCodes = false;
}

async function continueRemaining() {
  startError = (await runner.continueRemaining()) ?? '';
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

const MODES: [RunMode, string, string][] = [
  ['auto', 'Tự động', 'Tự điền và tự bấm Đổi'],
  ['semi', 'Bán tự động', 'Tự điền, bạn bấm Đổi'],
];

const SEGMENTS = 40;
</script>

{#if job && job.status !== 'done'}
  <!-- Active operation -->
  <section class="hud-panel flex flex-col gap-3 p-3">
    <div class="flex items-center justify-between">
      <span class="hud-label">Tiến độ</span>
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
          <div class="text-[11px] font-bold tracking-wider uppercase">{label}</div>
          <div class="text-[10px] opacity-75">{hint}</div>
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
          <div class="text-[9px] tracking-widest text-df-dim uppercase">{STATUS_LABEL[status]}</div>
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
        <span class="h-2 w-2 animate-pulse bg-df-accent"></span>
        {#if runner.waitingForUser}
          <span>
            Đã điền <b class="font-mono">{current ? maskCode(current) : ''}</b>. Hãy bấm nút <b>Đổi</b> trên trang,
            hoặc chọn <b>Tự động</b> ở trên để extension tự bấm.
          </span>
        {:else if current}
          <span>Đang gửi <b class="font-mono">{maskCode(current)}</b></span>
        {:else if runner.countdownMs > 0}
          <span>Code tiếp theo sau {Math.ceil(runner.countdownMs / 1000)} giây</span>
        {:else}
          <span>Đang chạy</span>
        {/if}
      </div>
    {:else if job.pauseReason}
      <div class="border border-df-warn/40 bg-df-warn/10 px-2 py-2 text-xs text-df-warn">
        <div class="font-semibold">{PAUSE_LABEL[job.pauseReason]}</div>
        {#if job.pauseDetail}<div class="mt-0.5 text-df-muted">{job.pauseDetail}</div>{/if}
      </div>
    {/if}

    <div class="flex gap-2">
      {#if job.status === 'running'}
        <button class="btn btn-ghost flex-1" onclick={() => runner.pause()}>Tạm dừng</button>
      {:else}
        <button class="btn btn-primary flex-1" onclick={() => runner.resume()}>Chạy tiếp</button>
      {/if}
      {#if confirmStop}
        <button class="btn btn-danger" onclick={stop}>Chắc chắn?</button>
        <button class="btn btn-ghost" onclick={() => (confirmStop = false)}>Không</button>
      {:else}
        <button class="btn btn-danger" onclick={() => (confirmStop = true)}>Kết thúc</button>
      {/if}
    </div>
    <button class="text-xs tracking-wider text-df-dim uppercase hover:text-df-accent" onclick={onShowResults}>
      Xem chi tiết kết quả ›
    </button>
  </section>
{:else}
  {#if job?.status === 'done'}
    <section class="hud-panel flex flex-col gap-2 p-3 text-xs">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="hud-label">Lượt trước</div>
          <div class="mt-1">
            <span class="text-df-accent">{runner.counts.success} thành công</span> ·
            {runner.counts.used} đã dùng · {runner.counts.invalid + runner.counts.expired} lỗi
            {#if runner.counts.unknown}· <span class="text-df-warn">{runner.counts.unknown} cần kiểm tra</span>{/if}
          </div>
        </div>
        <button class="btn btn-ghost" onclick={onShowResults}>Xem</button>
      </div>
      {#if remaining > 0}
        <button class="btn btn-primary w-full" disabled={!runner.probe?.loggedIn} onclick={continueRemaining}>
          Chạy tiếp {remaining} code còn lại
        </button>
      {/if}
    </section>
  {/if}

  <section class="hud-panel flex flex-col gap-3 p-3">
    <div class="flex items-center justify-between">
      <span class="hud-label">Nhập code</span>
      <div class="flex items-center gap-1">
        {#if runner.settings.feedUrl}
          <button
            class="btn btn-ghost px-2 py-1 text-[10px]"
            disabled={runner.feedBusy}
            onclick={pullFeed}
          >
            {runner.feedBusy ? 'Đang lấy…' : 'Lấy code mới'}
          </button>
        {/if}
        <button class="btn btn-ghost px-2 py-1 text-[10px]" onclick={() => fileInput?.click()}>Nhập file</button>
        {#if runner.draft}
          <button class="btn btn-ghost px-2 py-1 text-[10px]" onclick={() => runner.setDraft('', true)}>Xoá</button>
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
      placeholder="Dán code, mỗi dòng một code"
      spellcheck="false"
      value={runner.draft}
      oninput={(event) => runner.setDraft(event.currentTarget.value)}
    ></textarea>
    {#if feedMessage}<p class="-mt-2 text-[11px] text-df-accent">{feedMessage}</p>{/if}
    <p class="-mt-2 text-[10px] text-df-dim">
      Mẹo: trên trang có code, chuột phải chọn "Quét code trên trang này", hoặc bôi đen code rồi chọn "Thêm code vào Gift Code Redeemer".
    </p>

    <div class="flex flex-wrap gap-1.5 text-[11px]">
      <span class="border border-df-accent/40 bg-df-accent/10 px-1.5 py-0.5 text-df-accent">
        Sẽ chạy {toRun.length}
      </span>
      {#if runner.settings.skipKnown && split.known.length}
        <span class="border border-df-line-strong px-1.5 py-0.5 text-df-muted">
          Bỏ qua {split.known.length} đã xử lý
        </span>
      {/if}
      {#if parsed.duplicates.length}
        <span class="border border-df-line-strong px-1.5 py-0.5 text-df-muted">Trùng {parsed.duplicates.length}</span>
      {/if}
      {#if parsed.invalid.length}
        <span class="border border-df-danger/40 px-1.5 py-0.5 text-df-danger">
          Sai định dạng {parsed.invalid.length}
        </span>
      {/if}
      {#if nextBatch.length}
        <span class="border border-df-warn/40 px-1.5 py-0.5 text-df-warn">
          Để lượt sau {nextBatch.length}
        </span>
      {/if}
    </div>

    <div>
      <div class="hud-label mb-1.5">Chế độ</div>
      <div class="grid grid-cols-2 gap-1">
        {#each MODES as [value, label, hint] (value)}
          <button
            class="chamfer-frame px-2 py-1.5 text-left {runner.settings.mode === value
              ? 'is-active text-df-accent'
              : 'text-df-muted hover:text-df-text'}"
            onclick={() => runner.setMode(value)}
          >
            <div class="text-xs font-bold tracking-wider uppercase">{label}</div>
            <div class="text-[10px] opacity-75">{hint}</div>
          </button>
        {/each}
      </div>
    </div>

    <label class="flex items-start gap-2 text-xs text-df-muted">
      <input type="checkbox" class="mt-0.5 accent-df-accent" bind:checked={ownsCodes} />
      Tôi xác nhận các code này là code công khai hoặc do tôi sở hữu hợp pháp
    </label>

    {#if startError}<p class="text-xs text-df-danger">{startError}</p>{/if}

    <button
      class="btn btn-primary w-full py-2.5 text-sm"
      disabled={!ownsCodes || toRun.length === 0 || !runner.probe?.loggedIn || starting}
      onclick={start}
    >
      Bắt đầu đổi {toRun.length ? `${toRun.length} code` : ''}
    </button>
  </section>
{/if}
