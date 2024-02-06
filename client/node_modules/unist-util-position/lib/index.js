/**
 * @typedef {import('unist').Position} Position
 * @typedef {import('unist').Node} Node
 * @typedef {import('unist').Point} Point
 */

/**
 * @typedef NodeLike
 * @property {string} type
 * @property {PositionLike | null | undefined} [position]
 *
 * @typedef PositionLike
 * @property {PointLike | null | undefined} [start]
 * @property {PointLike | null | undefined} [end]
 *
 * @typedef PointLike
 * @property {number | null | undefined} [line]
 * @property {number | null | undefined} [column]
 * @property {number | null | undefined} [offset]
 */

/**
 * Get the starting point of `node`.
 *
 * @param node
 *   Node.
 * @returns
 *   Point.
 */
export const pointStart = point('start')

/**
 * Get the ending point of `node`.
 *
 * @param node
 *   Node.
 * @returns
 *   Point.
 */
export const pointEnd = point('end')

/**
 * Get the positional info of `node`.
 *
 * @param {NodeLike | Node | null | undefined} [node]
 *   Node.
 * @returns {Position}
 *   Position.
 */
export function position(node) {
  return {start: pointStart(node), end: pointEnd(node)}
}

/**
 * Get the positional info of `node`.
 *
 * @param {'start' | 'end'} type
 *   Side.
 * @returns
 *   Getter.
 */
function point(type) {
  return point

  /**
   * Get the point info of `node` at a bound side.
   *
   * @param {NodeLike | Node | null | undefined} [node]
   * @returns {Point}
   */
  function point(node) {
    const point = (node && node.position && node.position[type]) || {}

    // To do: next major: don’t return points when invalid.
    return {
      // @ts-expect-error: in practice, null is allowed.
      line: point.line || null,
      // @ts-expect-error: in practice, null is allowed.
      column: point.column || null,
      // @ts-expect-error: in practice, null is allowed.
      offset: point.offset > -1 ? point.offset : null
    }
  }
}
