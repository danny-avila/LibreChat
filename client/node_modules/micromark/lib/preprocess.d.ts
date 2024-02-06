/**
 * @returns {Preprocessor}
 */
export function preprocess(): Preprocessor
export type Chunk = import('micromark-util-types').Chunk
export type Code = import('micromark-util-types').Code
export type Encoding = import('micromark-util-types').Encoding
export type Value = import('micromark-util-types').Value
export type Preprocessor = (
  value: Value,
  encoding?: Encoding | null | undefined,
  end?: boolean | null | undefined
) => Array<Chunk>
