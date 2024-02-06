import type { XYCoord } from '../interfaces.js';
export declare type EqualityCheck<T> = (a: T, b: T) => boolean;
export declare const strictEquality: <T>(a: T, b: T) => boolean;
/**
 * Determine if two cartesian coordinate offsets are equal
 * @param offsetA
 * @param offsetB
 */
export declare function areCoordsEqual(offsetA: XYCoord | null | undefined, offsetB: XYCoord | null | undefined): boolean;
/**
 * Determines if two arrays of items are equal
 * @param a The first array of items
 * @param b The second array of items
 */
export declare function areArraysEqual<T>(a: T[], b: T[], isEqual?: EqualityCheck<T>): boolean;
