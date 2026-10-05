<script lang="ts">
import { runner } from '../runner.svelte';

const accounts = $derived(
  Object.entries(runner.known).map(([account, codes]) => {
    const values = Object.values(codes);
    return {
      account: account || 'Không rõ tài khoản',
      total: values.length,
      success: values.filter((s) => s === 'success').length,
    };
  }),
);

const totals = $derived(
  runner.history.reduce(
    (acc, h) => ({
      runs: acc.runs + 1,
      success: acc.success + h.counts.success,
      codes: acc.codes + h.total,
    }),
    { runs: 0, success: 0, codes: 0 },
  ),
);

function formatTime(ms: number) {
  return new Date(ms).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function duration(start: number, end: number) {
  const s = Math.round((end - start) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}
</script>

<section class="grid grid-cols-3 gap-1.5">
  {#each [['Lượt chạy', totals.runs], ['Code đã gửi', totals.codes], ['Thành công', totals.success]] as [label, value] (label)}
    <div class="hud-panel px-2 py-2">
      <div class="text-[9px] tracking-widest text-df-dim uppercase">{label}</div>
      <div class="text-xl font-semibold {label === 'Thành công' ? 'glow-text' : ''}">{value}</div>
    </div>
  {/each}
</section>

<section class="hud-panel p-3">
  <div class="hud-label mb-2">Các lượt gần đây</div>
  {#if runner.history.length === 0}
    <p class="text-xs text-df-dim">Chưa có lượt nào hoàn tất.</p>
  {:else}
    <ul class="flex flex-col gap-2">
      {#each runner.history as entry (entry.id)}
        {@const failed = entry.counts.invalid + entry.counts.expired}
        <li class="border border-df-line bg-black/20 p-2">
          <div class="flex items-center justify-between text-[11px] text-df-dim">
            <span>{formatTime(entry.finishedAt)} · {entry.account || 'N/A'}</span>
            <span>{entry.mode === 'auto' ? 'Tự động' : 'Bán tự động'} · {duration(entry.startedAt, entry.finishedAt)}</span>
          </div>
          <div class="mt-1.5 flex h-1.5 overflow-hidden bg-white/5">
            <span class="bg-df-accent" style="width: {(entry.counts.success / entry.total) * 100}%"></span>
            <span class="bg-df-muted/50" style="width: {(entry.counts.used / entry.total) * 100}%"></span>
            <span class="bg-df-danger/70" style="width: {(failed / entry.total) * 100}%"></span>
            <span class="bg-df-warn/70" style="width: {(entry.counts.unknown / entry.total) * 100}%"></span>
          </div>
          <div class="mt-1 text-xs">
            <span class="text-df-accent">{entry.counts.success} thành công</span>
            <span class="text-df-dim">· {entry.counts.used} đã dùng · {failed} lỗi · {entry.counts.unknown} cần kiểm tra · {entry.counts.pending} bỏ dở</span>
          </div>
        </li>
      {/each}
    </ul>
    <button class="btn btn-ghost mt-3 w-full" onclick={() => runner.clearHistory()}>Xoá lịch sử</button>
  {/if}
</section>

<section class="hud-panel p-3">
  <div class="hud-label mb-2">Code đã xử lý theo tài khoản</div>
  <p class="mb-2 text-[11px] text-df-dim">
    Chỉ lưu mã băm SHA 256, không lưu code gốc. Dùng để bỏ qua code đã có kết quả ở lượt sau.
  </p>
  {#if accounts.length === 0}
    <p class="text-xs text-df-dim">Chưa có dữ liệu.</p>
  {:else}
    <ul class="flex flex-col gap-1">
      {#each accounts as row (row.account)}
        <li class="flex items-center justify-between border border-df-line bg-black/20 px-2 py-1.5 text-xs">
          <span>{row.account}</span>
          <span class="text-df-dim">{row.total} code · <span class="text-df-accent">{row.success} thành công</span></span>
        </li>
      {/each}
    </ul>
  {/if}
</section>
