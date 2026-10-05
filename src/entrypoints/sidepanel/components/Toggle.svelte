<script lang="ts">
let {
  checked,
  label,
  hint,
  onchange,
}: { checked: boolean; label: string; hint?: string; onchange: (value: boolean) => void } =
  $props();
</script>

<label class="flex cursor-pointer items-start justify-between gap-3 py-2">
  <span class="flex flex-col">
    <span class="text-sm text-df-text">{label}</span>
    {#if hint}<span class="text-xs text-df-dim">{hint}</span>{/if}
  </span>
  <input
    type="checkbox"
    class="peer sr-only"
    {checked}
    onchange={(event) => onchange(event.currentTarget.checked)}
  />
  <span
    class="relative mt-0.5 h-5 w-9 shrink-0 border border-df-line-strong bg-black/40 transition-colors peer-checked:border-df-accent peer-checked:bg-df-accent/20 peer-focus-visible:ring-1 peer-focus-visible:ring-df-accent after:absolute after:top-0.5 after:left-0.5 after:h-3.5 after:w-3.5 after:bg-df-dim after:transition-all peer-checked:after:left-[18px] peer-checked:after:bg-df-accent"
  ></span>
</label>
