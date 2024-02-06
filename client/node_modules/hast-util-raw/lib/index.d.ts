/**
 * Given a hast tree and an optional vfile (for positional info), return a new
 * parsed-again hast tree.
 *
 * @param tree
 *   Original hast tree.
 * @param file
 *   Virtual file for positional info, optional.
 * @param options
 *   Configuration.
 */
export const raw: ((
  tree: Node,
  file: VFile | undefined,
  options?: Options
) => Node) &
  ((tree: Node, options?: Options) => Node)
export type VFile = import('vfile').VFile
export type P5Document = import('parse5').Document
export type P5Fragment = import('parse5').DocumentFragment
export type P5Element = Omit<import('parse5').Element, 'parentNode'>
export type P5Attribute = import('parse5').Attribute
export type P5Location = Omit<
  import('parse5').Location,
  'startOffset' | 'endOffset'
> & {
  startOffset: number | undefined
  endOffset: number | undefined
}
export type P5ParserOptions = import('parse5').ParserOptions
export type Root = import('hast').Root
export type Doctype = import('hast').DocType
export type Element = import('hast').Element
export type Text = import('hast').Text
export type Comment = import('hast').Comment
export type Content = import('hast').Content
export type Node = Root | Content
export type Raw = import('../complex-types').Raw
export type Stitch = Omit<Comment, 'value'> & {
  value: {
    stitch: Node
  }
}
export type Options = {
  /**
   * List of custom hast node types to pass through (keep) in hast.
   * If the passed through nodes have children, those children are expected to
   * be hast and will be handled.
   */
  passThrough?: string[] | undefined
}
export type HiddenTokenizer = {
  /**
   * Way too simple, but works for us.
   */
  __mixins: Array<HiddenLocationTracker>
  preprocessor: HiddenPreprocessor
  write: (value: string) => void
  _consume: () => number
  tokenQueue: Array<HiddenToken>
  state: string
  returnState: string
  charRefCode: number
  tempBuff: Array<number>
  _flushCodePointsConsumedAsCharacterReference: Function
  lastStartTagName: string
  consumedAfterSnapshot: number
  active: boolean
  currentCharacterToken: HiddenToken | undefined
  currentToken: HiddenToken | undefined
  currentAttr: unknown
  NAMED_CHARACTER_REFERENCE_STATE: Function
  NUMERIC_CHARACTER_REFERENCE_END_STATE: Function
}
export type HiddenToken = Record<string, unknown> & {
  location: P5Location
}
export type HiddenPreprocessor = {
  html: string | undefined
  pos: number
  lastGapPos: number
  lastCharPos: number
  gapStack: Array<number>
  skipNextNewLine: boolean
  lastChunkWritten: boolean
  endOfChunkHit: boolean
}
export type HiddenLocationTracker = {
  currentAttrLocation: P5Location | undefined
  ctLoc: P5Location
  posTracker: HiddenPosTracker
}
export type HiddenPosTracker = {
  isEol: boolean
  lineStartPos: number
  droppedBufferSize: number
  offset: number
  col: number
  line: number
}
