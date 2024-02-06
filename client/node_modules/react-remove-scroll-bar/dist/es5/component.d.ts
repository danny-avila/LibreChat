import * as React from 'react';
import { GapMode } from './utils';
export interface BodyScroll {
    noRelative?: boolean;
    noImportant?: boolean;
    gapMode?: GapMode;
}
/**
 * Removes page scrollbar and blocks page scroll when mounted
 */
export declare const RemoveScrollBar: React.FC<BodyScroll>;
