export declare type ValueType = string | number;
export interface DecimalClass {
    add: (value: ValueType) => DecimalClass;
    multi: (value: ValueType) => DecimalClass;
    isEmpty: () => boolean;
    isNaN: () => boolean;
    isInvalidate: () => boolean;
    toNumber: () => number;
    /**
     * Parse value as string. Will return empty string if `isInvalidate`.
     * You can set `safe=false` to get origin string content.
     */
    toString: (safe?: boolean) => string;
    equals: (target: DecimalClass) => boolean;
    lessEquals: (target: DecimalClass) => boolean;
    negate: () => DecimalClass;
}
