import type { ValueType } from './interface';
export declare function isEmpty(value: ValueType): boolean;
/**
 * Format string number to readable number
 */
export declare function trimNumber(numStr: string): {
    negative: boolean;
    negativeStr: string;
    trimStr: string;
    integerStr: string;
    decimalStr: string;
    fullStr: string;
};
export declare function isE(number: string | number): boolean;
/**
 * [Legacy] Convert 1e-9 to 0.000000001.
 * This may lose some precision if user really want 1e-9.
 */
export declare function getNumberPrecision(number: string | number): number;
/**
 * Convert number (includes scientific notation) to -xxx.yyy format
 */
export declare function num2str(number: number): string;
export declare function validateNumber(num: string | number): boolean;
