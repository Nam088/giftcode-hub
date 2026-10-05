<script lang="ts">
import { maskCode } from '@/lib/codes';
import { downloadText, toCsv } from '@/lib/export';
import type { ItemStatus } from '@/lib/job';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/labels';
import StatusBadge from '../components/StatusBadge.svelte';
import { runner } from '../runner.svelte';

let filter = $state<ItemStatus | 'all'>('all');
let reveal = $state(false);
let copied = $state('');
let query = $state('');

const job = $derived(runner.job);
const rows = $derived(
  (job?.items ?? [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => filter === 'all' || item.status === filter)
    .filter(({ item }) => !query || item.code.toLowerCase().includes(query.trim().toLowerCase())),
);

async function copy(label: string, statuses: ItemStatus[]) {
  const codes = (job?.items ?? []).filter((i) => statuses.includes(i.status)).map((i) => i.code);
  await navigator.clipboard.writeText(codes.join('\n'));
  copied = `Đã copy ${codes.length} code ${label}`;
  setTimeout(() => (copied = ''), 2000);
}

function exportCsv() {
  if (!job) return;
  const stamp = new Date(job.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '');
  downloadText(`redeem_${stamp}.csv`, toCsv(job.items));
}

const editable = $derived(job !== null && job.status !== 'running');

function time(ms?: number) {
  return ms ? new Date(ms).toLocaleTimeString('vi-VN', { hour12: false }) : '';
}
</script>

{#if !job}
  <section class="hud-panel p-6 text-center">
    <div class="hud-label">Chưa có dữ liệu</div>
    <p class="mt-2 text-xs text-df-dim">Kết quả của lượt đổi code sẽ hiện ở đây.</p>
  </section>
{:else}
  <section class="hud-panel flex flex-col gap-2 p-3">
    <div class="flex flex-wrap gap-1">
      <button
        class="border px-2 py-0.5 text-[11px] tracking-wide uppercase {filter === 'all'
          ? 'border-df-accent text-df-accent'
          : 'border-df-line text-df-dim hover:text-df-text'}"
        onclick={() => (filter = 'all')}
      >
        Tất cả {job.items.length}
      </button>
      {#each STATUS_ORDER as status (status)}
        {#if runner.counts[status] > 0}
          <button
            class="border px-2 py-0.5 text-[11px] tracking-wide uppercase {filter === status
              ? 'border-df-accent text-df-accent'
              : 'border-df-line text-df-dim hover:text-df-text'}"
            onclick={() => (filter = status)}
          >
            {STATUS_LABEL[status]} {runner.counts[status]}
          </button>
        {/if}
      {/each}
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button class="btn btn-ghost px-2 py-1 text-[10px]" onclick={() => copy('còn lại', ['pending', 'unknown'])}>
        Copy còn lại
      </button>
      <button class="btn btn-ghost px-2 py-1 text-[10px]" onclick={() => copy('thành công', ['success'])}>
        Copy thành công
      </button>
      <button class="btn btn-ghost px-2 py-1 text-[10px]" onclick={exportCsv}>Xuất CSV</button>
      <button class="btn btn-ghost ml-auto px-2 py-1 text-[10px]" onclick={() => (reveal = !reveal)}>
        {reveal ? 'Ẩn code' : 'Hiện code'}
      </button>
    </div>
    <input
      class="hud-input px-2 py-1.5 text-xs"
      type="search"
      placeholder="Tìm code"
      bind:value={query}
    />
    {#if runner.counts.unknown > 1 && editable}
      <button class="btn btn-ghost w-full py-1.5 text-[10px]" onclick={() => runner.requeueAllUnknown()}>
        Thử lại tất cả {runner.counts.unknown} code cần kiểm tra
      </button>
    {/if}
    {#if copied}<p class="text-[11px] text-df-accent">{copied}</p>{/if}
  </section>

  <ul class="hud-panel divide-y divide-df-line">
    {#each rows as { item, index } (index)}
      <li class="flex flex-col gap-1 px-3 py-2 {item.status === 'inFlight' ? 'bg-df-info/5' : ''}">
        <div class="flex items-center gap-2">
          <span class="w-6 shrink-0 text-right font-mono text-[10px] text-df-dim">{index + 1}</span>
          <span class="min-w-0 flex-1 truncate font-mono text-xs">
            {reveal ? item.code : maskCode(item.code)}
          </span>
          {#if item.at && item.status !== 'pending'}
            <span class="font-mono text-[10px] text-df-dim">{time(item.at)}</span>
          {/if}
          <StatusBadge status={item.status} />
        </div>
        {#if item.message && item.status !== 'success'}
          <p class="ml-8 truncate text-[11px] text-df-dim" title={item.message}>{item.message}</p>
        {/if}
        {#if item.status === 'unknown' && editable}
          <div class="ml-8 flex flex-wrap gap-1">
            <button class="btn btn-ghost px-2 py-0.5 text-[10px]" onclick={() => runner.requeueItem(index)}>
              Thử lại
            </button>
            <button class="btn btn-ghost px-2 py-0.5 text-[10px]" onclick={() => runner.resolveItem(index, 'success')}>
              Là thành công
            </button>
            <button class="btn btn-ghost px-2 py-0.5 text-[10px]" onclick={() => runner.resolveItem(index, 'used')}>
              Là đã dùng
            </button>
          </div>
        {/if}
      </li>
    {:else}
      <li class="px-3 py-4 text-center text-xs text-df-dim">Không có code nào ở mục này</li>
    {/each}
  </ul>

  {#if job.status === 'done'}
    <button class="btn btn-ghost w-full" onclick={() => runner.clearJob()}>Xoá kết quả lượt này</button>
  {/if}
{/if}
