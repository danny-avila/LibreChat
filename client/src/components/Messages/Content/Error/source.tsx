import { createContext, useContext, useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import type { ReactNode } from 'react';

/** The fields of a message that say who produced a failure and when. */
export type ErrorSource = Pick<TMessage, 'endpoint' | 'model' | 'createdAt'>;

const ErrorSourceContext = createContext<ErrorSource | undefined>(undefined);

/**
 * Supplies a message row's identity to the errors rendered inside it.
 *
 * A failure during a run is persisted as an error content part, and `Part` renders it without the
 * message it belongs to. Without this, its copy could only name the conversation's current
 * endpoint and model, which stop being the ones that failed as soon as the reader switches models.
 * The value is rebuilt from the identity fields alone, so a streaming row does not re-render its
 * error parts on every token.
 */
export function ErrorSourceProvider({
  message,
  children,
}: {
  message: ErrorSource;
  children: ReactNode;
}) {
  const { endpoint, model, createdAt } = message;
  const source = useMemo(() => ({ endpoint, model, createdAt }), [endpoint, model, createdAt]);
  return <ErrorSourceContext.Provider value={source}>{children}</ErrorSourceContext.Provider>;
}

export const useErrorSource = (): ErrorSource | undefined => useContext(ErrorSourceContext);
