import { extractCandidates } from '@/lib/codes';
import { looksLikeCode } from '@/lib/feed';
import { collectCodeTokens } from '@/lib/pageScan';
import { SITES } from '@/lib/sites';
import { inboxItem } from '@/lib/storage';

const MENU_ID = 'add-codes';
const SCAN_ID = 'scan-page';
// Every site accepts letters, digits and dashes; the active site's format is applied later
const CODE_FORMAT = SITES[0]?.codeFormat ?? /^[A-Za-z0-9-]{4,64}$/;

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel, which owns the redeem loop
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error('setPanelBehavior failed', error));

  browser.runtime.onInstalled.addListener(() => {
    // Titles come from public/_locales and follow the browser language
    browser.contextMenus.create({
      id: MENU_ID,
      title: browser.i18n.getMessage('menuAddCodes'),
      contexts: ['selection'],
    });
    browser.contextMenus.create({
      id: SCAN_ID,
      title: browser.i18n.getMessage('menuScanPage'),
      contexts: ['page'],
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID && info.menuItemId !== SCAN_ID) return;
    // sidePanel.open must run inside the click gesture, before any await
    if (tab?.windowId !== undefined) {
      browser.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
    }
    if (info.menuItemId === MENU_ID && info.selectionText) {
      void addToInbox(extractCandidates(info.selectionText, CODE_FORMAT));
    } else if (info.menuItemId === SCAN_ID && tab?.id !== undefined) {
      void scanPage(tab.id);
    }
  });
});

/**
 * Reads the page the user opened and picked "scan" on. activeTab grants access to that
 * one tab for this click only, so nothing is read in the background or on other sites.
 */
async function scanPage(tabId: number): Promise<void> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: collectCodeTokens,
    });
    const tokens = results.flatMap((r) => (Array.isArray(r.result) ? r.result : []));
    await addToInbox(tokens.filter((t) => looksLikeCode(t) && CODE_FORMAT.test(t)));
  } catch (error) {
    console.error('scan failed', error);
  }
}

async function addToInbox(codes: string[]): Promise<void> {
  if (codes.length === 0) return;
  await inboxItem.setValue([...(await inboxItem.getValue()), ...codes]);
}
