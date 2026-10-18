import { createContext } from 'react';
import type * as t from '~/admin/types';

/** The configuration page's value layers, read by `useFieldState` (WS4). Null outside the page. */
export const ConfigValuesContext = createContext<t.ConfigValuesData | null>(null);

/** Provides the value layers to every field rendered under it (WS4). */
export function ConfigValuesProvider({ value, children }: t.ConfigValuesProviderProps) {
  return <ConfigValuesContext.Provider value={value}>{children}</ConfigValuesContext.Provider>;
}
