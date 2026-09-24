import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { dataService } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

interface Original {
  canonicalText: string;
  revision: string;
  text?: string;
}
interface OwnerTextState {
  scope: string;
  messages: ReadonlyMap<string, Original>;
  loading: boolean;
}
const empty: OwnerTextState = { scope: '', messages: new Map(), loading: false };
const OwnerTextContext = createContext<OwnerTextState>(empty);

export function OwnerTextProvider({
  messages,
  conversationId,
  isSubmitting,
  children,
}: {
  messages: readonly TMessage[] | null;
  conversationId?: string;
  isSubmitting: boolean;
  children: ReactNode;
}) {
  const { user } = useAuthContext();
  const selection = useMemo(
    () =>
      JSON.stringify(
        (messages ?? [])
          .filter((message) => message.isCreatedByUser && message.privacyRevision)
          .map((message) => [message.messageId, message.privacyRevision, message.text])
          .sort(),
      ),
    [messages],
  );
  const scope = JSON.stringify([user?.id, user?.tenantId, conversationId, selection]);
  const [state, setState] = useState<OwnerTextState>(empty);
  useEffect(() => {
    let cancelled = false;
    const selected = JSON.parse(selection) as Array<[string, string, string]>;
    if (!user?.id || !conversationId || selected.length === 0) {
      setState(empty);
      return;
    }
    setState({ scope, messages: new Map(), loading: true });
    const load = async () => {
      const originals = new Map<string, Original>();
      try {
        for (let index = 0; index < selected.length; index += 50) {
          if (cancelled) {
            return;
          }
          const batch = selected.slice(index, index + 50);
          const result = await dataService.getOwnerMessageTexts(
            conversationId,
            batch.map(([id]) => id),
          );
          for (const message of result.messages) {
            if (
              batch.some(
                ([id, revision, text]) =>
                  id === message.messageId &&
                  revision === message.revision &&
                  text === message.canonicalText,
              )
            ) {
              originals.set(message.messageId, {
                revision: message.revision,
                text: message.text,
                canonicalText: message.canonicalText,
              });
            }
          }
        }
        if (!cancelled) {
          setState({ scope, messages: originals, loading: false });
        }
      } catch {
        if (!cancelled) {
          setState({ scope, messages: new Map(), loading: false });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [scope, selection, conversationId, user?.id, user?.tenantId, isSubmitting]);
  const visible = state.scope === scope ? state : empty;
  return <OwnerTextContext.Provider value={visible}>{children}</OwnerTextContext.Provider>;
}

/** No owner-view data is passed to edit, copy/export, retry, or prompt-building callbacks. */
export function PrivateText({ message }: { message: TMessage }) {
  const localize = useLocalize();
  const state = useContext(OwnerTextContext);
  const original = state.messages.get(message.messageId);
  const text =
    original != null &&
    original.revision === message.privacyRevision &&
    original.canonicalText === message.text
      ? original.text
      : undefined;
  return (
    <div>
      <div className="whitespace-pre-wrap break-words">{text ?? message.text}</div>
      <p className="mt-1 text-xs text-text-secondary" role="status">
        {localize('com_ui_private_text_hidden')}
        {text == null && (
          <span>
            {' '}
            ·{' '}
            {localize(
              state.loading ? 'com_ui_private_text_loading' : 'com_ui_private_text_unavailable',
            )}
          </span>
        )}
      </p>
    </div>
  );
}
