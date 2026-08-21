/** Rows in the sidebar's Pinned section. A favorite row is focusable itself
 *  (`role="button"`), while a chat row is a plain container whose link carries
 *  the focus, so both shapes have to be handled. */
const PINNED_ROW_SELECTOR = '[data-testid="convo-item"],[data-testid="favorite-item"]';

const focusableWithin = (row: HTMLElement): HTMLElement | null => {
  if (row.matches('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')) {
    return row;
  }
  return row.querySelector<HTMLElement>('a[href],button:not([disabled])');
};

/**
 * The element that should take focus when `row` is removed: the row below, else
 * the one above, else the New Chat button. Resolve this *before* starting the
 * removal: once the row unmounts there is no longer a position to search from.
 */
export const resolveRowBeside = (row: HTMLElement | null): HTMLElement | null => {
  const scope = row?.closest('[role="region"]') ?? row?.closest('ul');
  if (row && scope) {
    const rows = Array.from(scope.querySelectorAll<HTMLElement>(PINNED_ROW_SELECTOR));
    const current = rows.indexOf(row);
    const neighbour = rows[current + 1] ?? rows[current - 1];
    const target = neighbour ? focusableWithin(neighbour) : null;
    if (target) {
      return target;
    }
  }

  return document.querySelector<HTMLElement>('[data-testid="nav-new-chat-button"]');
};

/** Resolves and focuses in one step, for removals that happen synchronously. */
export const focusRowBeside = (row: HTMLElement | null): boolean => {
  const target = resolveRowBeside(row);
  target?.focus();
  return target != null && document.activeElement === target;
};

/**
 * Focuses the first surviving row in `scope`, falling back to the New Chat
 * button. For removals that report back only once the row is already gone, so
 * there is no longer a position to search around.
 */
export const focusFirstRow = (scope: HTMLElement | null): boolean => {
  const row = scope?.querySelector<HTMLElement>(PINNED_ROW_SELECTOR) ?? null;
  const target =
    (row && focusableWithin(row)) ??
    document.querySelector<HTMLElement>('[data-testid="nav-new-chat-button"]');
  target?.focus();
  return target != null && document.activeElement === target;
};
