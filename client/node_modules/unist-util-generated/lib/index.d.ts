/**
 * @typedef PointLike
 * @property {number | null | undefined} [line]
 * @property {number | null | undefined} [column]
 * @property {number | null | undefined} [offset]
 *
 * @typedef PositionLike
 * @property {PointLike | null | undefined} [start]
 * @property {PointLike | null | undefined} [end]
 *
 * @typedef NodeLike
 * @property {PositionLike | null | undefined} [position]
 */
/**
 * Check if `node` is generated.
 *
 * @param {NodeLike | null | undefined} [node]
 *   Node to check.
 * @returns {boolean}
 *   Whether `node` is generated (does not have positional info).
 */
export function generated(node?: NodeLike | null | undefined): boolean
export type PointLike = {
  line?: number | null | undefined
  column?: number | null | undefined
  offset?: number | null | undefined
}
export type PositionLike = {
  start?: PointLike | null | undefined
  end?: PointLike | null | undefined
}
export type NodeLike = {
  position?: PositionLike | null | undefined
}
