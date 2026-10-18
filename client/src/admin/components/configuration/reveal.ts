/**
 * Reveals a config path in the rendered tab (WS5: SH-3, SH-4): expands the
 * sections, groups and entry cards that lead to it, then scrolls to it,
 * highlights it and optionally focuses its control. Collapsed content renders
 * lazily, so this retries until the target exists or the attempts run out.
 */
import type * as t from '~/admin/types';

const RETRY_MS = 90;
const MAX_ATTEMPTS = 45;
const HIGHLIGHT_CLASS = 'cmdk-highlight';
const HIGHLIGHT_MS = 3000;
const CLOSED_GRID = '.config-section-grid-closed';
const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [role="switch"], [role="combobox"], [tabindex]:not([tabindex="-1"])';

/** `endpoints.custom.3` → `endpoints-custom-3` (the id scheme of field controls). */
export function dashedId(path: string): string {
  return path.replace(/\./g, '-');
}

/**
 * DOM ids a path may render under, most specific first: a nested group or
 * accordion item (`section-a.b`), an entry card (`section-a-b-3`, MCP
 * `section-mcpServers-<encoded name>`), or a field control (`a-b`).
 */
export function candidateIds(path: string): string[] {
  const segments = path.split('.');
  const ids = [`section-${path}`, `section-${dashedId(path)}`];
  if (segments.length > 1) {
    const encoded = `section-${segments[0]}-${segments.slice(1).map(encodeURIComponent).join('-')}`;
    if (!ids.includes(encoded)) ids.push(encoded);
  }
  ids.push(dashedId(path));
  return ids;
}

/** Path prefixes from the outermost (`a`) to the path itself (`a.b.c`). */
export function pathPrefixes(path: string): string[] {
  const segments = path.split('.');
  return segments.map((_, i) => segments.slice(0, i + 1).join('.'));
}

/**
 * The first element reached from `el` by a chain of direct-child steps (`child(el, 'h3', 'button')`
 * is `:scope > h3 > button`). Walked by hand: these ids hold dots, and some selector engines
 * resolve `:scope` through the id.
 */
function child(el: Element, ...steps: string[]): HTMLElement | null {
  const [step, ...rest] = steps;
  for (const node of el.children) {
    if (!node.matches(step)) continue;
    const found = rest.length ? child(node, ...rest) : node;
    if (found instanceof HTMLElement) return found;
  }
  return null;
}

function byId(root: ParentNode, id: string): HTMLElement | null {
  if ('getElementById' in root && typeof root.getElementById === 'function') {
    return root.getElementById(id) as HTMLElement | null;
  }
  return root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
}

/** The n-th entry card of a list whose cards carry no id (generic array fields). */
function nthEntryCard(container: HTMLElement, path: string): HTMLElement | null {
  const segments = path.split('.');
  const last = segments[segments.length - 1];
  if (!/^\d+$/.test(last)) return null;
  const list = byId(container.ownerDocument, dashedId(segments.slice(0, -1).join('.')));
  if (!list || !container.contains(list)) return null;
  const cards = Array.from(list.children).filter(
    (card): card is HTMLElement =>
      card instanceof HTMLElement && child(card, '[aria-expanded]') != null,
  );
  return cards[Number(last)] ?? null;
}

/** The element a path renders as, if it is in the container's DOM. */
export function findPathElement(container: HTMLElement, path: string): HTMLElement | null {
  const doc = container.ownerDocument;
  for (const id of candidateIds(path)) {
    const el = byId(doc, id);
    if (el && container.contains(el)) return el;
  }
  return nthEntryCard(container, path);
}

/** Whether a collapsible element (accordion item, group, card) is open, or not collapsible. */
function isOpen(el: HTMLElement): boolean {
  return el.getAttribute('data-state') !== 'closed' && !child(el, CLOSED_GRID);
}

/** Rendered and reachable: not inside an inert (collapsed) grid, a closed accordion or `hidden`. */
function isShown(el: HTMLElement): boolean {
  if (!el.isConnected || el.closest('[inert], [hidden]')) return false;
  const closedItem = el.closest('[data-state="closed"]');
  return !closedItem || closedItem === el;
}

/** Opens one collapsible container; returns whether it was closed. */
function expandContainer(el: HTMLElement, tried: WeakSet<HTMLElement>): boolean {
  if (el.getAttribute('data-state') === 'closed') {
    (child(el, 'button[aria-expanded="false"]') ?? child(el, 'h3', 'button'))?.click();
    return true;
  }
  if (!child(el, CLOSED_GRID)) return false;
  if (!tried.has(el)) {
    tried.add(el);
    el.dispatchEvent(new Event('config:expand'));
    return true;
  }
  (
    child(el, '[aria-expanded="false"]') ?? child(el, 'div', 'button[aria-expanded="false"]')
  )?.click();
  return true;
}

/** Opens the collapsed groups directly inside `scope` (not those nested in another closed group). */
function expandChildGroups(scope: HTMLElement, tried: WeakSet<HTMLElement>): boolean {
  let expanded = false;
  for (const grid of scope.querySelectorAll<HTMLElement>(CLOSED_GRID)) {
    const owner = grid.parentElement;
    if (!owner || owner === scope) continue;
    const outer = owner.parentElement?.closest(CLOSED_GRID);
    if (outer && scope.contains(outer)) continue;
    expanded = expandContainer(owner, tried) || expanded;
  }
  return expanded;
}

function scrollIntoContainer(container: HTMLElement, el: HTMLElement, align: 'center' | 'start') {
  const containerRect = container.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const offsetTop = rect.top - containerRect.top + container.scrollTop;
  const top =
    align === 'center'
      ? offsetTop - containerRect.height / 2 + rect.height / 2
      : offsetTop - stickyHeaderHeight(el, container) - 8;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  container.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
}

/**
 * Height of the sticky headers that will sit above `el` once it is scrolled
 * to: in each ancestor, the sticky children before the branch holding `el`
 * (section headers, open entry card headers).
 */
function stickyHeaderHeight(el: HTMLElement, container: HTMLElement): number {
  let height = 0;
  let branch: HTMLElement = el;
  let current = el.parentElement;
  while (current && current !== container) {
    for (const child of current.children) {
      if (child === branch) break;
      if (child instanceof HTMLElement && window.getComputedStyle(child).position === 'sticky') {
        height += child.getBoundingClientRect().height;
      }
    }
    branch = current;
    current = current.parentElement;
  }
  return height;
}

/** Sections, groups and cards land at the top; field controls are centred. */
function autoAlign(el: HTMLElement): 'center' | 'start' {
  return el.id.startsWith('section-') || el.hasAttribute('data-state') ? 'start' : 'center';
}

function focusTarget(el: HTMLElement) {
  const control = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE);
  control?.focus({ preventScroll: true });
}

function highlight(el: HTMLElement) {
  const row = el.closest<HTMLElement>('.settings-row, .config-row') ?? el;
  row.classList.remove(HIGHLIGHT_CLASS);
  row.getBoundingClientRect();
  row.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => row.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
}

/**
 * Expands, scrolls to, highlights and (optionally) focuses `target.path`
 * inside `container`. Returns a cancel function.
 */
export function revealConfigPath(
  container: HTMLElement,
  target: t.RevealTarget,
  { align = 'auto', focus = true, highlight: flash = true, onDone }: t.RevealOptions = {},
): () => void {
  const tried = new WeakSet<HTMLElement>();
  const prefixes = pathPrefixes(target.path);
  let attempts = 0;
  let timer: number | undefined;
  let cancelled = false;

  const finish = (el: HTMLElement | null) => {
    if (cancelled) return;
    cancelled = true;
    if (el) {
      scrollIntoContainer(container, el, align === 'auto' ? autoAlign(el) : align);
      if (flash) highlight(el);
      if (focus) window.setTimeout(() => focusTarget(el), 350);
    }
    onDone?.(el);
  };

  const attempt = () => {
    if (cancelled) return;
    attempts += 1;
    const el = findPathElement(container, target.path);
    if (el && isShown(el) && isOpen(el)) {
      finish(el);
      return;
    }

    let changed = false;
    if (target.sectionId) {
      const section = byId(container.ownerDocument, `section-${target.sectionId}`);
      if (section && container.contains(section)) changed = expandContainer(section, tried);
    }
    let deepest: HTMLElement | null = null;
    for (const prefix of prefixes) {
      const ancestor = findPathElement(container, prefix);
      if (!ancestor) continue;
      deepest = ancestor;
      changed = expandContainer(ancestor, tried) || changed;
    }
    if (!changed && deepest && !el) changed = expandChildGroups(deepest, tried);

    if (attempts >= MAX_ATTEMPTS) {
      finish(el && isShown(el) ? el : null);
      return;
    }
    timer = window.setTimeout(attempt, RETRY_MS);
  };

  attempt();
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
