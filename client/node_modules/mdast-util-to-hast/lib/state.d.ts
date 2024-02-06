/**
 * Create `state` from an mdast tree.
 *
 * @param {MdastNodes} tree
 *   mdast node to transform.
 * @param {Options | null | undefined} [options]
 *   Configuration.
 * @returns {State}
 *   `state` function.
 */
export function createState(
  tree: MdastNodes,
  options?: Options | null | undefined
): State
/**
 * Transform an mdast node into a hast node.
 *
 * @param {State} state
 *   Info passed around.
 * @param {MdastNodes} node
 *   mdast node.
 * @param {MdastParents | null | undefined} [parent]
 *   Parent of `node`.
 * @returns {HastElementContent | Array<HastElementContent> | null | undefined}
 *   Resulting hast node.
 */
export function one(
  state: State,
  node: MdastNodes,
  parent?: MdastParents | null | undefined
): HastElementContent | Array<HastElementContent> | null | undefined
/**
 * Transform the children of an mdast node into hast nodes.
 *
 * @param {State} state
 *   Info passed around.
 * @param {MdastNodes} parent
 *   mdast node to compile
 * @returns {Array<HastElementContent>}
 *   Resulting hast nodes.
 */
export function all(state: State, parent: MdastNodes): Array<HastElementContent>
/**
 * Wrap `nodes` with line endings between each node.
 *
 * @template {HastContent} Type
 *   Node type.
 * @param {Array<Type>} nodes
 *   List of nodes to wrap.
 * @param {boolean | null | undefined} [loose=false]
 *   Whether to add line endings at start and end.
 * @returns {Array<Type | HastText>}
 *   Wrapped nodes.
 */
export function wrap<Type extends import('hast').Content>(
  nodes: Type[],
  loose?: boolean | null | undefined
): (import('hast').Text | Type)[]
export type HastContent = import('hast').Content
export type HastElement = import('hast').Element
export type HastElementContent = import('hast').ElementContent
export type HastProperties = import('hast').Properties
export type HastRoot = import('hast').Root
export type HastText = import('hast').Text
export type MdastContent = import('mdast').Content
export type MdastDefinition = import('mdast').Definition
export type MdastFootnoteDefinition = import('mdast').FootnoteDefinition
export type MdastParent = import('mdast').Parent
export type MdastRoot = import('mdast').Root
export type HastNodes = HastRoot | HastContent
export type MdastNodes = MdastRoot | MdastContent
export type MdastParents = Extract<MdastNodes, MdastParent>
/**
 * hast fields.
 */
export type EmbeddedHastFields = {
  /**
   * Generate a specific element with this tag name instead.
   */
  hName?: string | null | undefined
  /**
   * Generate an element with these properties instead.
   */
  hProperties?: HastProperties | null | undefined
  /**
   * Generate an element with this content instead.
   */
  hChildren?: Array<HastElementContent> | null | undefined
}
/**
 * mdast data with embedded hast fields.
 */
export type MdastData = Record<string, unknown> & EmbeddedHastFields
/**
 * mdast node with embedded hast data.
 */
export type MdastNodeWithData = MdastNodes & {
  data?: MdastData | null | undefined
}
/**
 * Point-like value.
 */
export type PointLike = {
  /**
   * Line.
   */
  line?: number | null | undefined
  /**
   * Column.
   */
  column?: number | null | undefined
  /**
   * Offset.
   */
  offset?: number | null | undefined
}
/**
 * Position-like value.
 */
export type PositionLike = {
  /**
   * Point-like value.
   */
  start?: PointLike | null | undefined
  /**
   * Point-like value.
   */
  end?: PointLike | null | undefined
}
/**
 * Handle a node.
 */
export type Handler = (
  state: State,
  node: any,
  parent: MdastParents | null | undefined
) => HastElementContent | Array<HastElementContent> | null | undefined
/**
 * Signature of `state` for when props are passed.
 */
export type HFunctionProps = (
  node: MdastNodes | PositionLike | null | undefined,
  tagName: string,
  props: HastProperties,
  children?: Array<HastElementContent> | null | undefined
) => HastElement
/**
 * Signature of `state` for when no props are passed.
 */
export type HFunctionNoProps = (
  node: MdastNodes | PositionLike | null | undefined,
  tagName: string,
  children?: Array<HastElementContent> | null | undefined
) => HastElement
/**
 * Info on `state`.
 */
export type HFields = {
  /**
   * Whether HTML is allowed.
   */
  dangerous: boolean
  /**
   * Prefix to use to prevent DOM clobbering.
   */
  clobberPrefix: string
  /**
   * Label to use to introduce the footnote section.
   */
  footnoteLabel: string
  /**
   * HTML used for the footnote label.
   */
  footnoteLabelTagName: string
  /**
   * Properties on the HTML tag used for the footnote label.
   */
  footnoteLabelProperties: HastProperties
  /**
   * Label to use from backreferences back to their footnote call.
   */
  footnoteBackLabel: string
  /**
   * Definition cache.
   */
  definition: (identifier: string) => MdastDefinition | null
  /**
   * Footnote definitions by their identifier.
   */
  footnoteById: Record<string, MdastFootnoteDefinition>
  /**
   * Identifiers of order when footnote calls first appear in tree order.
   */
  footnoteOrder: Array<string>
  /**
   * Counts for how often the same footnote was called.
   */
  footnoteCounts: Record<string, number>
  /**
   * Applied handlers.
   */
  handlers: Handlers
  /**
   * Handler for any none not in `passThrough` or otherwise handled.
   */
  unknownHandler: Handler
  /**
   * Copy a node’s positional info.
   */
  patch: (from: MdastNodes, node: HastNodes) => void
  /**
   * Honor the `data` of `from`, and generate an element instead of `node`.
   */
  applyData: <Type extends HastNodes>(
    from: MdastNodes,
    to: Type
  ) => import('hast').Element | Type
  /**
   * Transform an mdast node to hast.
   */
  one: (
    node: MdastNodes,
    parent: MdastParents | null | undefined
  ) => HastElementContent | Array<HastElementContent> | null | undefined
  /**
   * Transform the children of an mdast parent to hast.
   */
  all: (node: MdastNodes) => Array<HastElementContent>
  /**
   * Wrap `nodes` with line endings between each node, adds initial/final line endings when `loose`.
   */
  wrap: <Type_1 extends import('hast').Content>(
    nodes: Type_1[],
    loose?: boolean | null | undefined
  ) => (Type_1 | import('hast').Text)[]
  /**
   * Like `state` but lower-level and usable on non-elements.
   * Deprecated: use `patch` and `applyData`.
   */
  augment: (
    left: MdastNodeWithData | PositionLike | null | undefined,
    right: HastElementContent
  ) => HastElementContent
  /**
   * List of node types to pass through untouched (except for their children).
   */
  passThrough: Array<string>
}
/**
 * Configuration (optional).
 */
export type Options = {
  /**
   * Whether to persist raw HTML in markdown in the hast tree.
   */
  allowDangerousHtml?: boolean | null | undefined
  /**
   * Prefix to use before the `id` attribute on footnotes to prevent it from
   * *clobbering*.
   */
  clobberPrefix?: string | null | undefined
  /**
   * Label to use from backreferences back to their footnote call (affects
   * screen readers).
   */
  footnoteBackLabel?: string | null | undefined
  /**
   * Label to use for the footnotes section (affects screen readers).
   */
  footnoteLabel?: string | null | undefined
  /**
   * Properties to use on the footnote label (note that `id: 'footnote-label'`
   * is always added as footnote calls use it with `aria-describedby` to
   * provide an accessible label).
   */
  footnoteLabelProperties?: HastProperties | null | undefined
  /**
   * Tag name to use for the footnote label.
   */
  footnoteLabelTagName?: string | null | undefined
  /**
   * Extra handlers for nodes.
   */
  handlers?: Handlers | null | undefined
  /**
   * List of custom mdast node types to pass through (keep) in hast (note that
   * the node itself is passed, but eventual children are transformed).
   */
  passThrough?: Array<string> | null | undefined
  /**
   * Handler for all unknown nodes.
   */
  unknownHandler?: Handler | null | undefined
}
/**
 * Handle nodes.
 */
export type Handlers = Record<string, Handler>
/**
 * Info passed around.
 */
export type State = HFunctionProps & HFunctionNoProps & HFields
