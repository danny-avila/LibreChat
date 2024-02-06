export declare const NONE: string[];
export declare const ALL: string[];
/**
 * Determines if the given handler IDs are dirty or not.
 *
 * @param dirtyIds The set of dirty handler ids
 * @param handlerIds The set of handler ids to check
 */
export declare function areDirty(dirtyIds: string[], handlerIds: string[] | undefined): boolean;
