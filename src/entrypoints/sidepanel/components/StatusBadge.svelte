<script lang="ts">
import type { ItemStatus } from '@/lib/job';
import { STATUS_LABEL, STATUS_TONE, type Tone } from '@/lib/labels';

let { status }: { status: ItemStatus } = $props();

const TONE_CLASS: Record<Tone, string> = {
  accent: 'text-df-accent border-df-accent/50 bg-df-accent/10',
  danger: 'text-df-danger border-df-danger/40 bg-df-danger/10',
  warn: 'text-df-warn border-df-warn/40 bg-df-warn/10',
  info: 'text-df-info border-df-info/40 bg-df-info/10',
  muted: 'text-df-muted border-df-line-strong bg-white/5',
};
</script>

<span
  class="inline-flex shrink-0 items-center border px-1.5 py-px text-[10px] font-semibold tracking-wider uppercase {TONE_CLASS[
    STATUS_TONE[status]
  ]}"
>
  {STATUS_LABEL[status]}
</span>
