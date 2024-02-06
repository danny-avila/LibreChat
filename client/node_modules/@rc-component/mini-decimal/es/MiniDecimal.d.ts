import BigIntDecimal from './BigIntDecimal';
import NumberDecimal from './NumberDecimal';
import type { DecimalClass, ValueType } from './interface';
export { NumberDecimal, BigIntDecimal };
export type { DecimalClass, ValueType };
export default function getMiniDecimal(value: ValueType): DecimalClass;
/**
 * Align the logic of toFixed to around like 1.5 => 2.
 * If set `cutOnly`, will just remove the over decimal part.
 */
export declare function toFixed(numStr: string, separatorStr: string, precision?: number, cutOnly?: boolean): any;
