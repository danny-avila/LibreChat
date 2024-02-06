/**
 * drop-in replacement for _.get
 * @param obj
 * @param path
 * @param defaultValue
 */
export declare function get<T>(obj: any, path: string, defaultValue: T): T;
/**
 * drop-in replacement for _.without
 */
export declare function without<T>(items: T[], item: T): T[];
/**
 * drop-in replacement for _.isString
 * @param input
 */
export declare function isString(input: any): boolean;
/**
 * drop-in replacement for _.isString
 * @param input
 */
export declare function isObject(input: any): boolean;
/**
 * replacement for _.xor
 * @param itemsA
 * @param itemsB
 */
export declare function xor<T extends string | number>(itemsA: T[], itemsB: T[]): T[];
/**
 * replacement for _.intersection
 * @param itemsA
 * @param itemsB
 */
export declare function intersection<T>(itemsA: T[], itemsB: T[]): T[];
