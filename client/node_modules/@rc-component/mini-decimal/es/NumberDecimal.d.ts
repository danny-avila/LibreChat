import type { DecimalClass, ValueType } from './interface';
/**
 * We can remove this when IE not support anymore
 */
export default class NumberDecimal implements DecimalClass {
    origin: string;
    number: number;
    empty: boolean;
    constructor(value: ValueType);
    negate(): NumberDecimal;
    add(value: ValueType): NumberDecimal;
    multi(value: ValueType): NumberDecimal;
    isEmpty(): boolean;
    isNaN(): boolean;
    isInvalidate(): boolean;
    equals(target: DecimalClass): boolean;
    lessEquals(target: DecimalClass): boolean;
    toNumber(): number;
    toString(safe?: boolean): string;
}
