export type UnistParent = import('unist').Parent
export type Point = import('unist').Point
export type Association = import('mdast').Association
export type Content = import('mdast').Content
export type ListContent = import('mdast').ListContent
export type PhrasingContent = import('mdast').PhrasingContent
export type Root = import('mdast').Root
export type TopLevelContent = import('mdast').TopLevelContent
export type ConstructName = import('../index.js').ConstructName
export type Node = Root | Content
export type Parent = Extract<Node, UnistParent>
export type FlowContent = TopLevelContent | ListContent
/**
 * Info on where we are in the document we are generating.
 */
export type TrackFields = {
  /**
   * Current point.
   */
  now: Point
  /**
   * Number of columns each line will be shifted by wrapping nodes.
   */
  lineShift: number
}
/**
 * Info on the characters that are around the current thing we are
 * generating.
 */
export type SafeFields = {
  /**
   * Characters before this (guaranteed to be one, can be more).
   */
  before: string
  /**
   * Characters after this (guaranteed to be one, can be more).
   */
  after: string
}
/**
 * Info on the surrounding of the node that is serialized.
 */
export type Info = TrackFields & SafeFields
/**
 * Get current tracked info.
 */
export type TrackCurrent = () => TrackFields
/**
 * Define a relative increased line shift (the typical indent for lines).
 */
export type TrackShift = (value: number) => void
/**
 * Move past some generated markdown.
 */
export type TrackMove = (value: string | null | undefined) => string
/**
 * Track positional info in the output.
 *
 * This info isn’t used yet but such functionality will allow line wrapping,
 * source maps, etc.
 */
export type Tracker = {
  /**
   * Get the current tracked info.
   */
  current: TrackCurrent
  /**
   * Define an increased line shift (the typical indent for lines).
   */
  shift: TrackShift
  /**
   * Move past some generated markdown.
   */
  move: TrackMove
}
/**
 * Track positional info in the output.
 *
 * This info isn’t used yet but such functionality will allow line wrapping,
 * source maps, etc.
 */
export type CreateTracker = (info: TrackFields) => Tracker
/**
 * Get an identifier from an association to match it to others.
 *
 * Associations are nodes that match to something else through an ID:
 * <https://github.com/syntax-tree/mdast#association>.
 *
 * The `label` of an association is the string value: character escapes and
 * references work, and casing is intact.
 * The `identifier` is used to match one association to another:
 * controversially, character escapes and references don’t work in this
 * matching: `&copy;` does not match `©`, and `\+` does not match `+`.
 *
 * But casing is ignored (and whitespace) is trimmed and collapsed: ` A\nb`
 * matches `a b`.
 * So, we do prefer the label when figuring out how we’re going to serialize:
 * it has whitespace, casing, and we can ignore most useless character
 * escapes and all character references.
 */
export type AssociationId = (node: Association) => string
/**
 * Map function to pad a single line.
 */
export type Map = (value: string, line: number, blank: boolean) => string
/**
 * Pad serialized markdown.
 */
export type IndentLines = (value: string, map: Map) => string
/**
 * Serialize the children of a parent that contains phrasing children.
 *
 * These children will be joined flush together.
 */
export type ContainerPhrasing = (
  parent: Parent & {
    children: Array<PhrasingContent>
  },
  info: Info
) => string
/**
 * Serialize the children of a parent that contains flow children.
 *
 * These children will typically be joined by blank lines.
 * What they are joined by exactly is defined by `Join` functions.
 */
export type ContainerFlow = (
  parent: Parent & {
    children: Array<FlowContent>
  },
  info: TrackFields
) => string
/**
 * Extra configuration for `safe`
 */
export type SafeEncodeFields = {
  /**
   * Extra characters that *must* be encoded (as character references) instead
   * of escaped (character escapes).
   *
   * Only ASCII punctuation will use character escapes, so you never need to
   * pass non-ASCII-punctuation here.
   */
  encode?: Array<string> | null | undefined
}
export type SafeConfig = SafeFields & SafeEncodeFields
/**
 * Make a string safe for embedding in markdown constructs.
 *
 * In markdown, almost all punctuation characters can, in certain cases,
 * result in something.
 * Whether they do is highly subjective to where they happen and in what
 * they happen.
 *
 * To solve this, `mdast-util-to-markdown` tracks:
 *
 * * Characters before and after something;
 * * What “constructs” we are in.
 *
 * This information is then used by this function to escape or encode
 * special characters.
 */
export type Safe = (
  input: string | null | undefined,
  config: SafeConfig
) => string
/**
 * Enter something.
 */
export type Enter = (name: ConstructName) => Exit
/**
 * Exit something.
 */
export type Exit = () => void
/**
 * Info passed around about the current state.
 */
export type State = {
  /**
   * Stack of constructs we’re in.
   */
  stack: Array<ConstructName>
  /**
   * Positions of child nodes in their parents.
   */
  indexStack: Array<number>
  /**
   * Pad serialized markdown.
   */
  indentLines: IndentLines
  /**
   * Get an identifier from an association to match it to others.
   */
  associationId: AssociationId
  /**
   * Serialize the children of a parent that contains phrasing children.
   */
  containerPhrasing: ContainerPhrasing
  /**
   * Serialize the children of a parent that contains flow children.
   */
  containerFlow: ContainerFlow
  /**
   * Track positional info in the output.
   */
  createTracker: CreateTracker
  /**
   * Serialize the children of a parent that contains flow children.
   */
  safe: Safe
  /**
   * Enter a construct (returns a corresponding exit function).
   */
  enter: Enter
  /**
   * Applied user configuration.
   */
  options: Options
  /**
   * Applied unsafe patterns.
   */
  unsafe: Array<Unsafe>
  /**
   * Applied join handlers.
   */
  join: Array<Join>
  /**
   * Call the configured handler for the given node.
   */
  handle: Handle
  /**
   * Applied handlers.
   */
  handlers: Handlers
  /**
   * List marker currently in use.
   */
  bulletCurrent: string | undefined
  /**
   * List marker previously in use.
   */
  bulletLastUsed: string | undefined
}
/**
 * Handle a particular node.
 */
export type Handle = (
  node: any,
  parent: Parent | undefined,
  state: State,
  Info: Info
) => string
/**
 * Handle particular nodes.
 *
 * Each key is a node type, each value its corresponding handler.
 */
export type Handlers = Record<Node['type'], Handle>
/**
 * How to join two blocks.
 *
 * “Blocks” are typically joined by one blank line.
 * Sometimes it’s nicer to have them flush next to each other, yet other
 * times they cannot occur together at all.
 *
 * Join functions receive two adjacent siblings and their parent and what
 * they return defines how many blank lines to use between them.
 */
export type Join = (
  left: Node,
  right: Node,
  parent: Parent,
  state: State
) => boolean | null | undefined | void | number
/**
 * Schema that defines when a character cannot occur.
 */
export type Unsafe = {
  /**
   * Single unsafe character.
   */
  character: string
  /**
   * Constructs where this is bad.
   */
  inConstruct?: ConstructName | Array<ConstructName> | null | undefined
  /**
   * Constructs where this is fine again.
   */
  notInConstruct?: ConstructName | Array<ConstructName> | null | undefined
  /**
   * `character` is bad when this is before it (cannot be used together with
   * `atBreak`).
   */
  before?: string | null | undefined
  /**
   * `character` is bad when this is after it.
   */
  after?: string | null | undefined
  /**
   * `character` is bad at a break (cannot be used together with `before`).
   */
  atBreak?: boolean | null | undefined
  /**
   * The unsafe pattern (this whole object) compiled as a regex.
   *
   * This is internal and must not be defined.
   */
  _compiled?: RegExp | null | undefined
}
/**
 * Configuration (optional).
 */
export type Options = {
  /**
   * Marker to use for bullets of items in unordered lists.
   */
  bullet?: '-' | '*' | '+' | null | undefined
  /**
   * Marker to use in certain cases where the primary bullet doesn’t work.
   *
   * There are three cases where the primary bullet cannot be used:
   *
   * *   When three list items are on their own, the last one is empty, and
   * `bullet` is also a valid `rule`: `* - +`.
   * This would turn into a thematic break if serialized with three primary
   * bullets.
   * As this is an edge case unlikely to appear in normal markdown, the
   * last list item will be given a different bullet.
   * *   When a thematic break is the first child of one of the list items, and
   * `bullet` is the same character as `rule`: `- ***`.
   * This would turn into a single thematic break if serialized with
   * primary bullets.
   * As this is an edge case unlikely to appear in normal markdown this
   * markup is always fixed, even if `bulletOther` is not passed
   * *   When two unordered lists appear next to each other: `* a\n- b`.
   * CommonMark sees different bullets as different lists, but several
   * markdown parsers parse it as one list.
   * To solve for both, we instead inject an empty comment between the two
   * lists: `* a\n<!---->\n* b`, but if `bulletOther` is given explicitly,
   * it will be used instead
   */
  bulletOther?: '-' | '*' | '+' | null | undefined
  /**
   * Marker to use for bullets of items in ordered lists.
   */
  bulletOrdered?: '.' | ')' | null | undefined
  /**
   * Marker to use in certain cases where the primary bullet for ordered items
   * doesn’t work.
   *
   * There is one case where the primary bullet for ordered items cannot be used:
   *
   * *   When two ordered lists appear next to each other: `1. a\n2) b`.
   * CommonMark added support for `)` as a marker, but other markdown
   * parsers do not support it.
   * To solve for both, we instead inject an empty comment between the two
   * lists: `1. a\n<!---->\n1. b`, but if `bulletOrderedOther` is given
   * explicitly, it will be used instead
   */
  bulletOrderedOther?: '.' | ')' | null | undefined
  /**
   * Whether to add the same number of number signs (`#`) at the end of an ATX
   * heading as the opening sequence.
   */
  closeAtx?: boolean | null | undefined
  /**
   * Marker to use for emphasis.
   */
  emphasis?: '_' | '*' | null | undefined
  /**
   * Marker to use for fenced code.
   */
  fence?: '~' | '`' | null | undefined
  /**
   * Whether to use fenced code always.
   *
   * The default is to use fenced code if there is a language defined, if the
   * code is empty, or if it starts or ends in blank lines.
   */
  fences?: boolean | null | undefined
  /**
   * Whether to increment the counter of ordered lists items.
   */
  incrementListMarker?: boolean | null | undefined
  /**
   * How to indent the content of list items.
   *
   * Either with the size of the bullet plus one space (when `'one'`), a tab
   * stop (`'tab'`), or depending on the item and its parent list (`'mixed'`,
   * uses `'one'` if the item and list are tight and `'tab'` otherwise).
   */
  listItemIndent?: 'tab' | 'one' | 'mixed' | null | undefined
  /**
   * Marker to use for titles.
   */
  quote?: '"' | "'" | null | undefined
  /**
   * Whether to always use resource links.
   *
   * The default is to use autolinks (`<https://example.com>`) when possible
   * and resource links (`[text](url)`) otherwise.
   */
  resourceLink?: boolean | null | undefined
  /**
   * Marker to use for thematic breaks.
   */
  rule?: '-' | '_' | '*' | null | undefined
  /**
   * Number of markers to use for thematic breaks.
   */
  ruleRepetition?: number | null | undefined
  /**
   * Whether to add spaces between markers in thematic breaks.
   */
  ruleSpaces?: boolean | null | undefined
  /**
   * Whether to use setext headings when possible.
   *
   * The default is to always use ATX headings (`# heading`) instead of setext
   * headings (`heading\n=======`).
   * Setext headings cannot be used for empty headings or headings with a rank
   * of three or more.
   */
  setext?: boolean | null | undefined
  /**
   * Marker to use for strong.
   */
  strong?: '_' | '*' | null | undefined
  /**
   * Whether to join definitions without a blank line.
   *
   * The default is to add blank lines between any flow (“block”) construct.
   * Turning this option on is a shortcut for a join function like so:
   *
   * ```js
   * function joinTightDefinitions(left, right) {
   * if (left.type === 'definition' && right.type === 'definition') {
   * return 0
   * }
   * }
   * ```
   */
  tightDefinitions?: boolean | null | undefined
  /**
   * Handle particular nodes.
   *
   * Each key is a node type, each value its corresponding handler.
   */
  handlers?: Partial<Handlers> | null | undefined
  /**
   * How to join blocks.
   */
  join?: Array<Join> | null | undefined
  /**
   * Schemas that define when characters cannot occur.
   */
  unsafe?: Array<Unsafe> | null | undefined
  /**
   * List of extensions to include.
   *
   * Each `ToMarkdownExtension` is an object with the same interface as
   * `Options` here.
   */
  extensions?: Array<Options> | null | undefined
}
