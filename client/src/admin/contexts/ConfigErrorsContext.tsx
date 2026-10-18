import { createContext } from 'react';
import type * as t from '~/admin/types';

/** Displayed path → inline error of the pending edits, read by `useFieldState` (WS1). Null outside the page. */
export const ConfigErrorsContext = createContext<t.PathErrors | null>(null);

/** Provides the per-path errors of the pending edits to every field rendered under it (WS1). */
export function ConfigErrorsProvider({ value, children }: t.ConfigErrorsProviderProps) {
  return <ConfigErrorsContext.Provider value={value}>{children}</ConfigErrorsContext.Provider>;
}
