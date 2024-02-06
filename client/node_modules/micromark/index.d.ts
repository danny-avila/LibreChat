export function micromark(
  value: Value,
  encoding: Encoding | null | undefined,
  options?: Options | null | undefined
): string
export function micromark(
  value: Value,
  options?: Options | null | undefined
): string
export type Encoding = import('micromark-util-types').Encoding
export type Options = import('micromark-util-types').Options
export type Value = import('micromark-util-types').Value
