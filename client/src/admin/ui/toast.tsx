import { useEffect } from 'react';
import { atom, getDefaultStore, useAtomValue } from 'jotai';
import { useLocalize } from '~/hooks';
import { Icon } from './Icon';
import { cn } from '~/utils';

/**
 * The admin panel's toasts. SassyChat's toast shows one message at a time; the panel raises
 * toasts from plain functions (outside React) and needs details and an Undo action, so it keeps
 * a small stack of its own, drawn with SassyChat's status roles.
 */

export interface ToastAction {
  label: string;
  altText?: string;
  type?: 'primary' | 'secondary';
  onClick: () => void;
}

export interface ToastOptions {
  type?: 'default' | 'success' | 'warning' | 'danger';
  title: string;
  description?: string;
  duration?: number;
  actions?: ToastAction[];
  className?: string;
}

interface ToastEntry extends ToastOptions {
  id: number;
}

const DEFAULT_DURATION_MS = 4000;
const MAX_TOASTS = 4;

/** The toasts on screen, newest last. */
const adminToastsAtom = atom<ToastEntry[]>([]);
let nextId = 1;

function dismiss(id: number) {
  getDefaultStore().set(adminToastsAtom, (current) => current.filter((toast) => toast.id !== id));
}

/** Shows a toast; callable from anywhere, like click-ui's. */
export function createToast(options: ToastOptions): void {
  const id = nextId++;
  getDefaultStore().set(adminToastsAtom, (current) =>
    [...current, { ...options, id }].slice(-MAX_TOASTS),
  );
}

const STATES: Record<
  NonNullable<ToastOptions['type']>,
  { icon: 'information' | 'check' | 'warning'; className: string }
> = {
  default: { icon: 'information', className: 'border-border-light' },
  success: { icon: 'check', className: 'border-status-success-border' },
  warning: { icon: 'warning', className: 'border-status-warning-border' },
  danger: { icon: 'warning', className: 'border-alert-error-border' },
};

function Toast({ toast }: { toast: ToastEntry }) {
  const localize = useLocalize();
  const state = STATES[toast.type ?? 'default'];
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), toast.duration ?? DEFAULT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration]);
  return (
    <li
      role={toast.type === 'danger' ? 'alert' : 'status'}
      className={cn(
        'bg-surface-dialog text-text-primary pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border p-3 shadow-lg',
        state.className,
        toast.className,
      )}
    >
      <Icon name={state.icon} size="sm" aria-hidden className="mt-0.5" />
      <div className="min-w-0 flex-1 break-words">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description && (
          <p className="text-text-secondary mt-1 text-xs whitespace-pre-line">
            {toast.description}
          </p>
        )}
        {toast.actions && toast.actions.length > 0 && (
          <div className="mt-2 flex gap-2">
            {toast.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                aria-label={action.altText ?? action.label}
                onClick={() => {
                  action.onClick();
                  dismiss(toast.id);
                }}
                className="border-border-light hover:bg-surface-hover focus-visible:ring-focus-control rounded-md border px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-hidden"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={localize('com_ui_close')}
        onClick={() => dismiss(toast.id)}
        className="text-text-secondary hover:bg-surface-hover focus-visible:ring-focus-control rounded p-0.5 focus-visible:ring-2 focus-visible:outline-hidden"
      >
        <Icon name="cross" size="sm" aria-hidden />
      </button>
    </li>
  );
}

/** Where the panel's toasts appear; rendered once by the panel's layout. */
export function AdminToaster() {
  const current = useAtomValue(adminToastsAtom);
  if (current.length === 0) {
    return null;
  }
  return (
    <ol
      aria-live="polite"
      className="admin-toaster pointer-events-none fixed right-4 z-(--z-toast) flex flex-col gap-2"
    >
      {current.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </ol>
  );
}
