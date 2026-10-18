import { createContext } from 'react';

/**
 * Whether the page's "Show configured only" filter is on, for renderers below
 * the generic `FieldRenderer` (collection entry fields) that do not receive
 * the page props (WS3).
 */
export const ConfiguredOnlyContext = createContext(false);
