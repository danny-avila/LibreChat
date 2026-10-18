import { createContext } from 'react';

/**
 * The setting a search result or deep link is revealing (`?field=`), so a
 * field hidden behind "Add field" shows itself to be scrolled to (WS5).
 */
export const RevealTargetContext = createContext<string | null>(null);
