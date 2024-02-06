/**
 * @param {CompileOptions | null | undefined} [options]
 * @returns {Compile}
 */
export function compile(options?: CompileOptions | null | undefined): Compile
export type Compile = import('micromark-util-types').Compile
export type CompileContext = import('micromark-util-types').CompileContext
export type CompileData = import('micromark-util-types').CompileData
export type CompileOptions = import('micromark-util-types').CompileOptions
export type Definition = import('micromark-util-types').Definition
export type Event = import('micromark-util-types').Event
export type Handle = import('micromark-util-types').Handle
export type HtmlExtension = import('micromark-util-types').HtmlExtension
export type NormalizedHtmlExtension =
  import('micromark-util-types').NormalizedHtmlExtension
export type Token = import('micromark-util-types').Token
export type Media = {
  image?: boolean | undefined
  labelId?: string | undefined
  label?: string | undefined
  referenceId?: string | undefined
  destination?: string | undefined
  title?: string | undefined
}
