import type { DecimalClass, ValueType } from './interface';
export default class BigIntDecimal implements DecimalClass {
    origin: string;
    negative: boolean;
    integer: bigint;
    decimal: bigint;
    /** BigInt will convert `0009` to `9`. We need record the len of decimal */
    decimalLen: number;
    empty: boolean;
    nan: boolean;
    constructor(value: string | number);
    private getMark;
    private getIntegerStr;
    /**
     * @private get decimal string
     */
    getDecimalStr(): string;
    /**
     * @private Align BigIntDecimal with same decimal length. e.g. 12.3 + 5 = 1230000
     * This is used for add function only.
     */
    alignDecimal(decimalLength: number): bigint;
    negate(): BigIntDecimal;
    private cal;
    add(value: ValueType): BigIntDecimal;
    multi(value: ValueType): BigIntDecimal;
    isEmpty(): boolean;
    isNaN(): boolean;
    isInvalidate(): boolean;
    equals(target: DecimalClass): boolean;
    lessEquals(target: DecimalClass): boolean;
    toNumber(): number;
    toString(safe?: boolean): string;
}
