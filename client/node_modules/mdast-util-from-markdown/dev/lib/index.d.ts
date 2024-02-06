/**
 * @param value
 *   Markdown to parse.
 * @param encoding
 *   Character encoding for when `value` is `Buffer`.
 * @param options
 *   Configuration.
 * @returns
 *   mdast tree.
 */
export const fromMarkdown: ((
  value: Value,
  encoding: Encoding,
  options?: Options | null | undefined
) => Root) &
  ((value: Value, options?: Options | null | undefined) => Root)
export type Encoding = import('micromark-util-types').Encoding
export type Event = import('micromark-util-types').Event
export type ParseOptions = import('micromark-util-types').ParseOptions
export type Token = import('micromark-util-types').Token
export type TokenizeContext = import('micromark-util-types').TokenizeContext
export type Value = import('micromark-util-types').Value
export type UnistParent = import('unist').Parent
export type Point = import('unist').Point
export type PhrasingContent = import('mdast').PhrasingContent
export type StaticPhrasingContent = import('mdast').StaticPhrasingContent
export type Content = import('mdast').Content
export type Break = import('mdast').Break
export type Blockquote = import('mdast').Blockquote
export type Code = import('mdast').Code
export type Definition = import('mdast').Definition
export type Emphasis = import('mdast').Emphasis
export type Heading = import('mdast').Heading
export type HTML = import('mdast').HTML
export type Image = import('mdast').Image
export type ImageReference = import('mdast').ImageReference
export type InlineCode = import('mdast').InlineCode
export type Link = import('mdast').Link
export type LinkReference = import('mdast').LinkReference
export type List = import('mdast').List
export type ListItem = import('mdast').ListItem
export type Paragraph = import('mdast').Paragraph
export type Root = import('mdast').Root
export type Strong = import('mdast').Strong
export type Text = import('mdast').Text
export type ThematicBreak = import('mdast').ThematicBreak
export type ReferenceType = import('mdast').ReferenceType
export type CompileData = import('../index.js').CompileData
export type Node = Root | Content
export type Parent = Extract<Node, UnistParent>
export type Fragment = Omit<UnistParent, 'type' | 'children'> & {
  type: 'fragment'
  children: Array<PhrasingContent>
}
/**
 * Extra transform, to change the AST afterwards.
 */
export type Transform = (tree: Root) => Root | undefined | null | void
/**
 * Handle a token.
 */
export type Handle = (this: CompileContext, token: Token) => void
/**
 * Token types mapping to handles
 */
export type Handles = Record<string, Handle>
/**
 * Handle the case where the `right` token is open, but it is closed (by the
 * `left` token) or because we reached the end of the document.
 */
export type OnEnterError = (
  this: Omit<CompileContext, 'sliceSerialize'>,
  left: Token | undefined,
  right: Token
) => void
/**
 * Handle the case where the `right` token is open but it is closed by
 * exiting the `left` token.
 */
export type OnExitError = (
  this: Omit<CompileContext, 'sliceSerialize'>,
  left: Token,
  right: Token
) => void
/**
 * Open token on the stack, with an optional error handler for when
 * that token isn’t closed properly.
 */
export type TokenTuple = [Token, OnEnterError | undefined]
/**
 * Configuration.
 *
 * We have our defaults, but extensions will add more.
 */
export type Config = {
  /**
   *   Token types where line endings are used.
   */
  canContainEols: Array<string>
  /**
   *   Opening handles.
   */
  enter: Handles
  /**
   *   Closing handles.
   */
  exit: Handles
  /**
   *   Tree transforms.
   */
  transforms: Array<Transform>
}
/**
 * Change how markdown tokens from micromark are turned into mdast.
 */
export type Extension = Partial<Config>
/**
 * mdast compiler context.
 */
export type CompileContext = {
  /**
   *   Stack of nodes.
   */
  stack: Array<Node | Fragment>
  /**
   *   Stack of tokens.
   */
  tokenStack: Array<TokenTuple>
  /**
   *   Get data from the key/value store.
   */
  getData: <Key extends keyof import('../index.js').CompileData>(
    key: Key
  ) => import('../index.js').CompileData[Key]
  /**
   *   Set data into the key/value store.
   */
  setData: <Key_1 extends keyof import('../index.js').CompileData>(
    key: Key_1,
    value?: import('../index.js').CompileData[Key_1] | undefined
  ) => void
  /**
   *   Capture some of the output data.
   */
  buffer: (this: CompileContext) => void
  /**
   *   Stop capturing and access the output data.
   */
  resume: (this: CompileContext) => string
  /**
   *   Enter a token.
   */
  enter: <Kind extends Node>(
    this: CompileContext,
    node: Kind,
    token: Token,
    onError?: OnEnterError
  ) => Kind
  /**
   *   Exit a token.
   */
  exit: (this: CompileContext, token: Token, onError?: OnExitError) => Node
  /**
   *   Get the string value of a token.
   */
  sliceSerialize: TokenizeContext['sliceSerialize']
  /**
   *   Configuration.
   */
  config: Config
}
/**
 * Configuration for how to build mdast.
 */
export type FromMarkdownOptions = {
  /**
   * Extensions for this utility to change how tokens are turned into a tree.
   */
  mdastExtensions?: Array<Extension | Array<Extension>> | null | undefined
}
/**
 * Configuration.
 */
export type Options = ParseOptions & FromMarkdownOptions
