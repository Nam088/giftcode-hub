import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  // The dev browser is launched by scripts/browser.ts so the login session persists
  webExt: { disabled: true },
  manifest: {
    name: 'Gift Code Redeemer (unofficial)',
    description: 'Redeem gift codes you own, one by one, on supported official redeem pages.',
    permissions: [
      'storage',
      'sidePanel',
      'contextMenus',
      'notifications',
      'activeTab',
      'scripting',
    ],
    host_permissions: ['https://redeem.df.garena.sg/*'],
    action: { default_title: 'Open Gift Code Redeemer' },
  },
});
