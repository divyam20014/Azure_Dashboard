/**
 * Session cleanup helpers. Issue data only ever lives in React state, the parsing
 * worker and the file input; these helpers make sure each of them lets go.
 * (The JavaScript engine reclaims the memory itself; no claim is made about
 * forensic erasure of physical memory.)
 */

const FORM_CONTROLS = 'input, select, textarea, button, option';

/**
 * Tear down a view that displayed uploaded data, just before React removes it.
 *
 * Browsers may keep native references to form controls after they leave the page
 * (observed in Chrome: a detached <select> pinned by a C++ persistent handle). A
 * detached element still links to its old parent and siblings, so one pinned control
 * would keep the whole removed view — every rendered title, name and status — in
 * memory. Breaking every parent/child link and blanking form-control values and
 * attributes leaves any pinned control isolated and empty.
 */
export function scrubSubtree(root: Element | null): void {
  if (!root) return;
  try {
    const all = Array.from(root.querySelectorAll('*'));
    for (const el of all) {
      if (!el.matches(FORM_CONTROLS)) continue;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.value = '';
        el.defaultValue = '';
      }
      for (const name of el.getAttributeNames()) el.removeAttribute(name);
    }
    for (let i = all.length - 1; i >= 0; i--) all[i].replaceChildren();
    root.replaceChildren();
  } catch {
    // Best effort: the view is being removed either way.
  }
}

/** Clear the selected file from every file input so the File object is no longer referenced. */
export function resetFileInputs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
    input.value = '';
  });
}

/**
 * Warn before the page is closed or refreshed while an analysis is open. Nothing is
 * persisted, so a refresh discards the data — the browser prompt makes that explicit.
 */
export function installUnloadGuard(): () => void {
  const handler = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
