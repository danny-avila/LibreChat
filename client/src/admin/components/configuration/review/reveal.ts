import type * as t from '~/admin/types';

/** Time for an expanded section or card to render its children before the next step. */
const SETTLE_MS = 220;
/** Lets a tab switch render before the first lookup. */
const FIRST_DELAY_MS = 80;
/** Expansion rounds before giving up on reaching the field itself. */
const MAX_ROUNDS = 6;
const HIGHLIGHT_CLASS = 'cmdk-highlight';
const CLOSED_GRID = '.config-section-grid-closed';

/** DOM ids the configuration page uses for a path: controls (dots → dashes), groups, sections and cards. */
function candidateIds(segments: string[]): string[] {
  const dots = segments.join('.');
  const dashes = segments.join('-');
  const ids = [dashes, `section-${dots}`, `section-${dashes}`];
  if (segments.length === 2) ids.push(`section-${segments[0]}-${encodeURIComponent(segments[1])}`);
  if (segments.length === 1 && segments[0] === 'endpoints') ids.push('section-endpointsProviders');
  return ids;
}

/** Entry cards id their fields by entry name: `Moonshot-baseURL`, `github-timeout`. */
function entryFieldId(path: string, entry?: t.RevealEntry): string | undefined {
  if (!entry?.identity || !path.startsWith(`${entry.entryPath}.`)) return undefined;
  return `${entry.identity}-${path
    .slice(entry.entryPath.length + 1)
    .split('.')
    .join('-')}`;
}

function findDeepest(
  segments: string[],
  entryId: string | undefined,
): { element: HTMLElement; depth: number } | undefined {
  const field = entryId ? document.getElementById(entryId) : null;
  if (field) return { element: field, depth: segments.length };
  for (let depth = segments.length; depth > 0; depth--) {
    for (const id of candidateIds(segments.slice(0, depth))) {
      const element = document.getElementById(id);
      if (element) return { element, depth };
    }
  }
  return undefined;
}

/** Opens a collapsed section, nested group, entry card or accordion item; true when it did. */
function expand(element: HTMLElement): boolean {
  if (element.getAttribute('data-state') === 'closed') {
    const trigger = element.querySelector<HTMLElement>(':scope > button[data-state="closed"]');
    trigger?.click();
    return trigger != null;
  }
  if (!element.querySelector(`:scope > ${CLOSED_GRID}, :scope > * > ${CLOSED_GRID}`)) return false;
  const header = element.querySelector<HTMLElement>(
    ':scope > [role="button"][aria-expanded="false"]',
  );
  if (header) header.click();
  else element.dispatchEvent(new Event('config:expand'));
  return true;
}

/** Expands every collapsed ancestor of the path that is on the page; true when anything opened. */
function expandAncestors(segments: string[]): boolean {
  let opened = false;
  for (let depth = 1; depth <= segments.length; depth++) {
    for (const id of candidateIds(segments.slice(0, depth))) {
      const element = document.getElementById(id);
      if (element && expand(element)) opened = true;
    }
  }
  return opened;
}

function focusTarget(element: HTMLElement): void {
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  element.classList.remove(HIGHLIGHT_CLASS);
  void element.offsetWidth;
  element.classList.add(HIGHLIGHT_CLASS);
  const focusable = element.matches('input, select, textarea, button')
    ? element
    : element.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]');
  setTimeout(() => focusable?.focus({ preventScroll: true }), 400);
}

/**
 * Scrolls the configuration page to the control for a config path (the
 * review's "Go to field"), opening the sections, groups and entry cards on
 * the way. Falls back to the closest element that exists, such as a
 * collapsed entry card or the section.
 */
export function revealConfigPath(path: string, entry?: t.RevealEntry, round = 0): void {
  const segments = path.split('.');
  setTimeout(
    () => {
      const opened = expandAncestors(segments);
      const deepest = findDeepest(segments, entryFieldId(path, entry));
      const reached = deepest?.depth === segments.length;
      const retry = (!reached && opened) || !deepest;
      if (retry && round < MAX_ROUNDS) {
        revealConfigPath(path, entry, round + 1);
        return;
      }
      if (deepest) focusTarget(deepest.element);
    },
    round === 0 ? FIRST_DELAY_MS : SETTLE_MS,
  );
}
