import { createContext } from 'react';
import type * as t from '~/admin/types';

/**
 * While the tab filter is active: the data paths that match it (settings,
 * groups, entries, sections), indexed. Rows that neither match nor sit inside
 * or around a match are hidden, and groups and cards holding a match open
 * (WS5). Null when no filter is applied, and inside dialogs.
 */
export const RowFilterContext = createContext<t.PathIndex | null>(null);
