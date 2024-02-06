/**
 * Turn an mdast syntax tree into markdown.
 *
 * @param {Node} tree
 *   Tree to serialize.
 * @param {Options} [options]
 *   Configuration (optional).
 * @returns {string}
 *   Serialized markdown representing `tree`.
 */
export function toMarkdown(
  tree: Node,
  options?: import('./types.js').Options | undefined
): string
export type Enter = import('./types.js').Enter
export type Info = import('./types.js').Info
export type Join = import('./types.js').Join
export type FlowContent = import('./types.js').FlowContent
export type Node = import('./types.js').Node
export type Options = import('./types.js').Options
export type Parent = import('./types.js').Parent
export type PhrasingContent = import('./types.js').PhrasingContent
export type SafeConfig = import('./types.js').SafeConfig
export type State = import('./types.js').State
export type TrackFields = import('./types.js').TrackFields
