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
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: [
      'storage',
      'sidePanel',
      'contextMenus',
      'notifications',
      'activeTab',
      'scripting',
    ],
    // One entry per supported redeem page (see src/lib/sites)
    host_permissions: ['https://redeem.df.garena.sg/*', 'https://www.playdeltaforce.com/*'],
    action: { default_title: '__MSG_actionTitle__' },
  },
});
