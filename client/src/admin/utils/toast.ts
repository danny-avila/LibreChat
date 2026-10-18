import { createToast } from '~/admin/ui';

/** Lets long unbroken text (dotted config paths) wrap inside the toast. */
const WRAP_CLASS = 'toast-wrap';

/** Separates an error's summary from its per-path details ("Validation failed — a: …; b: …"). */
const DETAIL_SEPARATOR = ' — ';

/** How long an Undo toast stays up. */
const UNDO_DURATION_MS = 5000;

let errorToastHolds = 0;

/**
 * Suppresses error toasts while a view that shows errors itself is open (the
 * change review), so a failed save is reported once, in place. Returns the
 * release function; holds nest.
 */
export function holdErrorToasts(): () => void {
  errorToastHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    errorToastHolds -= 1;
  };
}

/** A long error becomes a short title with its details, one per line, underneath. */
function splitError(message: string): { title: string; description?: string } {
  const separator = message.indexOf(DETAIL_SEPARATOR);
  if (separator === -1) return { title: message };
  const details = message.slice(separator + DETAIL_SEPARATOR.length);
  return { title: message.slice(0, separator), description: details.split(/;\s+/).join('\n') };
}

export const notifySuccess = (title: string): void => createToast({ type: 'success', title });

export const notifyError = (message: string): void => {
  if (errorToastHolds > 0) return;
  createToast({ type: 'danger', ...splitError(message), className: WRAP_CLASS });
};

export const notifyWarning = (title: string, description?: string): void =>
  createToast({ type: 'warning', title, description, className: WRAP_CLASS });

export const notifyInfo = (title: string): void => createToast({ type: 'default', title });

/** A toast with an Undo action, shown for a few seconds. */
export const notifyUndo = (title: string, undoLabel: string, onUndo: () => void): void =>
  createToast({
    type: 'default',
    title,
    duration: UNDO_DURATION_MS,
    actions: [{ label: undoLabel, altText: undoLabel, type: 'secondary', onClick: onUndo }],
  });
