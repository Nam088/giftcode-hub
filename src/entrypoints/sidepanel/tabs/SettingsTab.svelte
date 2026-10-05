<script lang="ts">
import { downloadText } from '@/lib/export';
import { MIN_DELAY_MS } from '@/lib/storage';
import Toggle from '../components/Toggle.svelte';
import { runner } from '../runner.svelte';

let confirmWipe = $state(false);
let backupMessage = $state('');
let backupError = $state(false);
let backupInput: HTMLInputElement | undefined = $state();

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
    backupMessage = await runner.importBackup(await file.text());
    backupError = false;
  } catch (error) {
    backupMessage = error instanceof Error ? error.message : String(error);
    backupError = true;
  }
}
let feedUrl = $state(runner.settings.feedUrl);
let feedMessage = $state('');

async function saveFeed() {
  await runner.saveSettings({ feedUrl: feedUrl.trim() });
  feedMessage = feedUrl.trim() ? await runner.syncFeed() : 'Đã tắt nguồn code';
}

const lastSync = $derived(
  runner.feedSync
    ? new Date(runner.feedSync.at).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : '',
);
const delaySeconds = $derived(runner.settings.delayMs / 1000);
const account = $derived(runner.probe?.account ?? '');
const running = $derived(runner.job?.status === 'running');
</script>

<section class="hud-panel p-3">
  <div class="hud-label mb-1">Tốc độ</div>
  <div class="flex items-center justify-between py-2">
    <span class="text-sm">Giãn cách giữa các code</span>
    <span class="glow-text font-mono text-sm">{delaySeconds}s</span>
  </div>
  <input
    type="range"
    class="w-full accent-df-accent"
    min={MIN_DELAY_MS / 1000}
    max="20"
    step="1"
    value={delaySeconds}
    oninput={(event) => runner.saveSettings({ delayMs: Number(event.currentTarget.value) * 1000 })}
  />
  <p class="mt-1 text-[11px] text-df-dim">
    Tối thiểu {MIN_DELAY_MS / 1000} giây. Trang bỏ qua thông báo mới khi thông báo cũ còn hiện (khoảng 2 giây),
    và gửi quá nhanh có thể khiến tài khoản bị giới hạn.
  </p>
</section>

<section class="hud-panel divide-y divide-df-line px-3 py-1">
  <Toggle
    label="Bỏ qua code đã xử lý"
    hint="Không gửi lại code đã có kết quả trên cùng tài khoản"
    checked={runner.settings.skipKnown}
    onchange={(value) => runner.saveSettings({ skipKnown: value })}
  />
  <Toggle
    label="Che code khi xong lượt"
    hint="Code đã có kết quả sẽ bị che trong danh sách. Code còn lại vẫn giữ để chạy tiếp"
    checked={runner.settings.maskFinishedCodes}
    onchange={(value) => runner.saveSettings({ maskFinishedCodes: value })}
  />
  <Toggle
    label="Thông báo trên máy"
    hint="Báo khi xong lượt hoặc khi tự tạm dừng (mất đăng nhập, cần kiểm tra)"
    checked={runner.settings.notify}
    onchange={(value) => runner.saveSettings({ notify: value })}
  />
</section>

<section class="hud-panel flex flex-col gap-2 p-3">
  <div class="hud-label">Nguồn code tự động</div>
  <p class="text-[11px] text-df-dim">
    Link tới file <span class="font-mono">feed/codes.json</span> do GitHub Action cập nhật hằng ngày, ví dụ
    <span class="font-mono break-all">https://raw.githubusercontent.com/&lt;user&gt;/&lt;repo&gt;/main/feed/codes.json</span>
  </p>
  <input
    class="hud-input px-2 py-1.5 font-mono text-xs"
    type="url"
    placeholder="https://raw.githubusercontent.com/…/feed/codes.json"
    bind:value={feedUrl}
  />
  <button class="btn btn-ghost w-full" onclick={saveFeed}>Lưu và lấy code</button>
  {#if feedMessage}<p class="text-[11px] text-df-accent">{feedMessage}</p>{/if}
  {#if lastSync}
    <p class="text-[11px] text-df-dim">
      Lần lấy gần nhất {lastSync}: {runner.feedSync?.active} code còn mới, thêm {runner.feedSync?.added}
    </p>
  {/if}
</section>

<section class="hud-panel divide-y divide-df-line px-3 py-1">
  <Toggle
    label="Tự lấy code khi mở"
    hint="Tối đa 6 giờ một lần. Code mới được thêm vào ô nhập, bạn vẫn tự bấm chạy"
    checked={runner.settings.autoSyncFeed}
    onchange={(value) => runner.saveSettings({ autoSyncFeed: value })}
  />
</section>

<section class="hud-panel flex flex-col gap-2 p-3">
  <div class="hud-label">Dữ liệu</div>
  <div class="grid grid-cols-2 gap-2">
    <button class="btn btn-ghost" onclick={exportBackup}>Sao lưu</button>
    <button class="btn btn-ghost" onclick={() => backupInput?.click()}>Khôi phục</button>
  </div>
  <input
    bind:this={backupInput}
    type="file"
    accept=".json,application/json"
    class="hidden"
    onchange={importBackup}
  />
  <p class="text-[11px] text-df-dim">
    File sao lưu gồm cài đặt, lịch sử và mã băm code đã xử lý. Không chứa code gốc.
  </p>
  {#if backupMessage}
    <p class="text-[11px] {backupError ? 'text-df-danger' : 'text-df-accent'}">{backupMessage}</p>
  {/if}
  <button
    class="btn btn-ghost w-full"
    disabled={!runner.known[account]}
    onclick={() => runner.forgetKnown(account)}
  >
    Quên code đã xử lý của {account || 'tài khoản hiện tại'}
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
        Xác nhận xoá hết
      </button>
      <button class="btn btn-ghost" onclick={() => (confirmWipe = false)}>Huỷ</button>
    </div>
  {:else}
    <button class="btn btn-danger w-full" disabled={running} onclick={() => (confirmWipe = true)}>
      Xoá toàn bộ dữ liệu
    </button>
  {/if}
  <p class="text-[11px] text-df-dim">
    Mọi dữ liệu chỉ lưu trên máy này. Extension không gửi code, cookie hay thông tin tài khoản ra ngoài.
  </p>
</section>

<section class="hud-panel p-3 text-[11px] leading-relaxed text-df-dim">
  <div class="hud-label mb-1">Lưu ý</div>
  Đây là công cụ không chính thức, không liên kết với nhà phát hành. Extension chỉ điền và bấm trên trang
  đổi quà như bạn làm thủ công, không vượt captcha và không gọi API ẩn. Tự động hoá có thể trái điều khoản
  dịch vụ của nhà phát hành và dẫn tới khoá tài khoản. Bạn tự chịu trách nhiệm khi sử dụng.
</section>
