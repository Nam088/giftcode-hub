<script lang="ts">
import { onMount } from 'svelte';

interface Option {
  value: string;
  label: string;
}

let {
  id,
  value,
  options,
  disabled = false,
  title,
  icon,
  size = 'sm',
  onchange,
}: {
  id?: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  title?: string;
  icon?: 'globe' | 'language';
  size?: 'sm' | 'md';
  onchange: (val: string) => void;
} = $props();

let open = $state(false);
let containerRef: HTMLDivElement | undefined = $state();

const selectedOption = $derived(options.find((opt) => opt.value === value) ?? options[0]);

function toggle() {
  if (disabled) return;
  open = !open;
}

function select(val: string) {
  onchange(val);
  open = false;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open = false;
  }
}

onMount(() => {
  function handleClickOutside(event: MouseEvent) {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      open = false;
    }
  }
  document.addEventListener('click', handleClickOutside);
  return () => {
    document.removeEventListener('click', handleClickOutside);
  };
});
</script>

<div
  bind:this={containerRef}
  class="relative w-full"
  {title}
>
  <!-- Hidden native select for form/Playwright E2E compatibility -->
  <select
    {id}
    class="sr-only"
    tabindex="-1"
    aria-hidden="true"
    {value}
    {disabled}
    onchange={(e) => onchange(e.currentTarget.value)}
  >
    {#each options as opt (opt.value)}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>

  <!-- Tactical Trigger Button -->
  <button
    type="button"
    class="group relative flex w-full items-center justify-between border border-df-line bg-df-panel/90 text-left transition-all {disabled
      ? 'cursor-not-allowed opacity-50'
      : open
        ? 'border-df-accent shadow-[0_0_10px_rgba(15,247,150,0.25)] bg-df-panel-2'
        : 'hover:border-df-line-strong hover:bg-df-panel-2/90'} {size === 'sm'
      ? 'py-1.5 px-2.5 text-xs'
      : 'py-2 px-3 text-sm'}"
    {disabled}
    onclick={toggle}
    onkeydown={handleKeydown}
    aria-expanded={open}
  >
    <!-- HUD Corner Ticks -->
    <span
      class="pointer-events-none absolute -top-px -left-px h-1.5 w-1.5 border-t-2 border-l-2 {open
        ? 'border-df-accent'
        : 'border-df-accent/70 group-hover:border-df-accent'}"
    ></span>
    <span
      class="pointer-events-none absolute -bottom-px -right-px h-1.5 w-1.5 border-b-2 border-r-2 {open
        ? 'border-df-accent'
        : 'border-df-accent/70 group-hover:border-df-accent'}"
    ></span>

    <!-- Content: Icon + Label -->
    <div class="flex min-w-0 flex-1 items-center gap-2">
      {#if icon === 'globe'}
        <span class="text-df-accent/80 transition-colors group-hover:text-df-accent">
          <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="10" cy="10" r="7" />
            <path d="M3 10h14M10 3a12 12 0 0 1 0 14M10 3a12 12 0 0 0 0 14" />
          </svg>
        </span>
      {:else if icon === 'language'}
        <span class="text-df-accent/80 transition-colors group-hover:text-df-accent">
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8">
            <path
              d="M4 5h7M9 3v2c0 3.5-2 7-5 9M5 9c2 1 4 3 5 5M12 20l5-11 5 11M14 16h6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      {/if}
      <span class="truncate font-semibold tracking-wider text-df-text uppercase">
        {selectedOption?.label ?? value}
      </span>
    </div>

    <!-- Animated Chevron Icon -->
    <span
      class="ml-2 shrink-0 text-df-accent/80 transition-transform duration-200 group-hover:text-df-accent {open
        ? 'rotate-180 text-df-accent'
        : ''}"
    >
      <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="currentColor">
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </span>
  </button>

  <!-- Custom Dropdown Menu & Items -->
  {#if open}
    <ul
      class="hud-panel absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto border border-df-line-strong bg-df-panel/98 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.75)] backdrop-blur-md"
      role="listbox"
    >
      {#each options as opt (opt.value)}
        {@const isSelected = opt.value === value}
        <li
          role="option"
          aria-selected={isSelected}
          class="group/item flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-semibold tracking-wider uppercase transition-all {isSelected
            ? 'border-l-2 border-df-accent bg-df-accent/15 text-df-accent font-bold'
            : 'text-df-muted hover:border-l-2 hover:border-df-accent/60 hover:bg-df-panel-2 hover:text-df-text hover:pl-3.5'}"
          onclick={() => select(opt.value)}
          onkeydown={(e) => e.key === 'Enter' && select(opt.value)}
          tabindex="0"
        >
          <span class="truncate">{opt.label}</span>
          {#if isSelected}
            <span class="text-df-accent">
              <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
