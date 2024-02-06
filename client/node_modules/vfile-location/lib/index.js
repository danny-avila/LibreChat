/**
 * @typedef {import('vfile').VFile} VFile
 * @typedef {import('vfile').Value} Value
 */

/**
 * @typedef Point
 *   unist point, where `line` and `column` can be `undefined`.
 * @property {number | undefined} line
 *   Line.
 * @property {number | undefined} column
 *   Column.
 * @property {number | undefined} [offset]
 *   Offset.
 *
 * @typedef PointLike
 *   unist point, allowed as input.
 * @property {number | null | undefined} [line]
 *   Line.
 * @property {number | null | undefined} [column]
 *   Column.
 * @property {number | null | undefined} [offset]
 *   Offset.
 *
 * @callback ToPoint
 *   Get a line/column-based `point` from `offset`.
 * @param {number | null | undefined} [offset]
 *   Something that should be an `offset.
 * @returns {Point}
 *   Point, line/column are undefined for invalid or out of bounds input.
 *
 * @callback ToOffset
 *   Get an offset from a line/column-based `point`.
 * @param {Point | null | undefined} [point]
 *   Something that should be a `point.
 * @returns {number}
 *   Offset or `-1` for invalid or out of bounds input.
 *
 * @typedef Location
 *   Accessors for index.
 * @property {ToPoint} toPoint
 *   Get a line/column-based `point` from `offset`.
 * @property {ToOffset} toOffset
 *   Get an offset from a line/column-based `point`.
 */

/**
 * Index the given document so you can translate between line/column and offset
 * based positional info.
 *
 * @param {VFile | Value} file
 *   File to index.
 * @returns {Location}
 *   Accessors for index.
 */
export function location(file) {
  const value = String(file)
  /** @type {Array<number>} */
  const indices = []
  const search = /\r?\n|\r/g

  while (search.test(value)) {
    indices.push(search.lastIndex)
  }

  indices.push(value.length + 1)

  return {toPoint, toOffset}

  /** @type {ToPoint} */
  function toPoint(offset) {
    let index = -1

    if (
      typeof offset === 'number' &&
      offset > -1 &&
      offset < indices[indices.length - 1]
    ) {
      while (++index < indices.length) {
        if (indices[index] > offset) {
          return {
            line: index + 1,
            column: offset - (index > 0 ? indices[index - 1] : 0) + 1,
            offset
          }
        }
      }
    }

    return {line: undefined, column: undefined, offset: undefined}
  }

  /** @type {ToOffset} */
  function toOffset(point) {
    const line = point && point.line
    const column = point && point.column

    if (
      typeof line === 'number' &&
      typeof column === 'number' &&
      !Number.isNaN(line) &&
      !Number.isNaN(column) &&
      line - 1 in indices
    ) {
      const offset = (indices[line - 2] || 0) + column - 1 || 0

      if (offset > -1 && offset < indices[indices.length - 1]) {
        return offset
      }
    }

    return -1
  }
}
