import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@librechat/client';
import { useLocalize } from '~/hooks';

export type MCPAppAction =
  | { kind: 'tool'; serverName: string; toolName: string; argumentsText: string }
  | { kind: 'message'; serverName: string; text: string };

type Pending = {
  action: MCPAppAction;
  settle: (allowed: boolean, notify?: boolean) => void;
};

/** An App can request an action but only a host-controlled button can grant it. */
export function useMCPAppApproval() {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const request = useCallback((action: MCPAppAction, signal: AbortSignal): Promise<boolean> => {
    if (signal.aborted || pendingRef.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const settle = (allowed: boolean, notify = true) => {
        if (pendingRef.current !== entry) return;
        pendingRef.current = null;
        signal.removeEventListener('abort', abort);
        if (notify) setPending(null);
        resolve(allowed && !signal.aborted);
      };
      const abort = () => settle(false);
      const entry: Pending = { action, settle };
      pendingRef.current = entry;
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      else setPending(entry);
    });
  }, []);
  const cancel = useCallback(() => pendingRef.current?.settle(false), []);
  // Resolve an outstanding SDK request when the owning View disappears.
  useEffect(
    () => () => {
      pendingRef.current?.settle(false, false);
    },
    [],
  );
  return {
    pending: pending?.action ?? null,
    request,
    cancel,
    approve: () => pendingRef.current?.settle(true),
  };
}

export function MCPAppApproval({
  action,
  approve,
  cancel,
}: {
  action: MCPAppAction | null;
  approve: () => void;
  cancel: () => void;
}) {
  const localize = useLocalize();
  return (
    <AlertDialog
      open={action != null}
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <AlertDialogContent className="w-11/12 max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {localize(
              action?.kind === 'tool'
                ? 'com_ui_mcp_app_confirm_tool'
                : 'com_ui_mcp_app_confirm_message',
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {localize('com_ui_mcp_app_action_warning')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {action && (
          <div className="text-text-primary max-h-64 overflow-auto text-sm">
            <p className="font-semibold">
              {action.serverName}
              {action.kind === 'tool' ? ` / ${action.toolName}` : ''}
            </p>
            <pre className="mt-2 break-all whitespace-pre-wrap">
              {action.kind === 'tool' ? action.argumentsText : action.text}
            </pre>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancel}>{localize('com_ui_cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={approve}>
            {localize(
              action?.kind === 'tool' ? 'com_ui_mcp_app_run_tool' : 'com_ui_mcp_app_send_message',
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
