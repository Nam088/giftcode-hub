/**
 * Runs inside the page the user is looking at (injected with scripting.executeScript
 * after they pick the context menu item), so it must stay self contained: no imports,
 * no outer variables. Returns texts of elements that hold a single code like token,
 * skipping links and page chrome where words like "Download" sit alone.
 */
export function collectCodeTokens(): string[] {
  const found = new Set<string>();
  const skip = 'a,nav,header,footer,script,style,noscript,select,option,svg';
  for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
    if (el.closest(skip)) continue;
    const text = (el.innerText ?? el.textContent ?? '').trim();
    if (text.length >= 5 && text.length <= 32 && /^[A-Za-z0-9]+$/.test(text)) found.add(text);
  }
  return [...found];
}
