import type { ParseFlags, ParserOptions } from "./types.js";
export declare abstract class Setter {
  abstract priority: number;
  subPriority: number;
  validate<DateType extends Date>(
    _utcDate: DateType,
    _options?: ParserOptions,
  ): boolean;
  abstract set<DateType extends Date>(
    utcDate: DateType,
    flags: ParseFlags,
    options: ParserOptions,
  ): DateType | [DateType, ParseFlags];
}
export declare class ValueSetter<Value> extends Setter {
  private value;
  private validateValue;
  private setValue;
  priority: number;
  constructor(
    value: Value,
    validateValue: <DateType extends Date>(
      utcDate: DateType,
      value: Value,
      options: ParserOptions,
    ) => boolean,
    setValue: <DateType extends Date>(
      utcDate: DateType,
      flags: ParseFlags,
      value: Value,
      options: ParserOptions,
    ) => DateType | [DateType, ParseFlags],
    priority: number,
    subPriority?: number,
  );
  validate<DateType extends Date>(
    date: DateType,
    options: ParserOptions,
  ): boolean;
  set<DateType extends Date>(
    date: DateType,
    flags: ParseFlags,
    options: ParserOptions,
  ): DateType | [DateType, ParseFlags];
}
export declare class DateToSystemTimezoneSetter extends Setter {
  priority: number;
  subPriority: number;
  set<DateType extends Date>(date: DateType, flags: ParseFlags): DateType;
}
