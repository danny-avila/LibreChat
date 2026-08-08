import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Button, OGDialog, OGDialogTemplate } from '@librechat/client';
import type { ReactNode } from 'react';
import useLocalize from '~/hooks/useLocalize';

export type PiiAction = 'anonymize' | 'send_as_is';

type PendingConfirmation = {
  id: number;
  entityTypes: string[];
  resolve: (action: PiiAction | null) => void;
};

type PiiConfirmationContextValue = {
  requestPiiAction: (entityTypes: string[], signal?: AbortSignal) => Promise<PiiAction | null>;
};

const PiiConfirmationContext = createContext<PiiConfirmationContextValue | null>(null);

export function PiiConfirmationProvider({ children }: { children: ReactNode }) {
  const localize = useLocalize();
  const nextId = useRef(0);
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const requestPiiAction = useCallback(
    (entityTypes: string[], signal?: AbortSignal): Promise<PiiAction | null> => {
      if (signal?.aborted) {
        return Promise.resolve(null);
      }

      return new Promise((resolve) => {
        const id = ++nextId.current;
        const onAbort = () => settle(null);
        const settle = (action: PiiAction | null) => {
          signal?.removeEventListener('abort', onAbort);
          if (pendingRef.current?.id === id) {
            pendingRef.current = null;
            setPending(null);
          }
          resolve(action);
        };
        const confirmation = { id, entityTypes, resolve: settle };
        pendingRef.current?.resolve(null);
        pendingRef.current = confirmation;
        setPending(confirmation);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
    [],
  );
  const contextValue = useMemo(() => ({ requestPiiAction }), [requestPiiAction]);

  return (
    <PiiConfirmationContext.Provider value={contextValue}>
      {children}
      <OGDialog open={pending != null} onOpenChange={() => undefined}>
        <OGDialogTemplate
          title={localize('com_ui_pii_confirmation_title')}
          showCloseButton={false}
          showCancelButton={false}
          className="w-11/12 max-w-md bg-surface-primary text-text-primary"
          main={
            <div className="space-y-2 text-sm text-text-secondary">
              <p>{localize('com_ui_pii_confirmation_message')}</p>
              {pending?.entityTypes.length ? (
                <p>
                  {localize('com_ui_pii_detected_types')}: {pending.entityTypes.join(', ')}
                </p>
              ) : null}
            </div>
          }
          buttons={
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => pending?.resolve('send_as_is')}
                aria-label={localize('com_ui_pii_send_as_is')}
              >
                {localize('com_ui_pii_send_as_is')}
              </Button>
              <Button
                type="button"
                variant="submit"
                onClick={() => pending?.resolve('anonymize')}
                aria-label={localize('com_ui_pii_anonymize')}
              >
                {localize('com_ui_pii_anonymize')}
              </Button>
            </div>
          }
        />
      </OGDialog>
    </PiiConfirmationContext.Provider>
  );
}

export function usePiiConfirmation(): PiiConfirmationContextValue {
  const context = useContext(PiiConfirmationContext);
  if (context == null) {
    throw new Error('usePiiConfirmation must be used within a PiiConfirmationProvider');
  }
  return context;
}
