export declare function memoize<T>(fn: () => T): () => T;
/**
 * drop-in replacement for _.without
 */
export declare function without<T>(items: T[], item: T): T[];
export declare function union<T extends string | number>(itemsA: T[], itemsB: T[]): T[];
