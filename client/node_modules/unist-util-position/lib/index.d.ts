/**
 * Get the positional info of `node`.
 *
 * @param {NodeLike | Node | null | undefined} [node]
 *   Node.
 * @returns {Position}
 *   Position.
 */
export function position(node?: NodeLike | Node | null | undefined): Position
/**
 * Get the point info of `node` at a bound side.
 *
 * @param {NodeLike | Node | null | undefined} [node]
 * @returns {Point}
 */
export function pointStart(node?: NodeLike | Node | null | undefined): Point
/**
 * Get the point info of `node` at a bound side.
 *
 * @param {NodeLike | Node | null | undefined} [node]
 * @returns {Point}
 */
export function pointEnd(node?: NodeLike | Node | null | undefined): Point
export type Position = import('unist').Position
export type Node = import('unist').Node
export type Point = import('unist').Point
export type NodeLike = {
  type: string
  position?: PositionLike | null | undefined
}
export type PositionLike = {
  start?: PointLike | null | undefined
  end?: PointLike | null | undefined
}
export type PointLike = {
  line?: number | null | undefined
  column?: number | null | undefined
  offset?: number | null | undefined
}
