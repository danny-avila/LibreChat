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
export function generated(node) {
  return (
    !node ||
    !node.position ||
    !node.position.start ||
    !node.position.start.line ||
    !node.position.start.column ||
    !node.position.end ||
    !node.position.end.line ||
    !node.position.end.column
  )
}
