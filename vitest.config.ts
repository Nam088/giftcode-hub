import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  // svelte() compiles runes in .svelte.ts modules (i18n, runner) for tests
  plugins: [WxtVitest(), svelte()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
