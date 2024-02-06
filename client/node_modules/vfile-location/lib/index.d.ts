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
export function location(file: VFile | Value): Location
export type VFile = import('vfile').VFile
export type Value = import('vfile').Value
/**
 * unist point, where `line` and `column` can be `undefined`.
 */
export type Point = {
  /**
   *   Line.
   */
  line: number | undefined
  /**
   *   Column.
   */
  column: number | undefined
  /**
   * Offset.
   */
  offset?: number | undefined
}
/**
 * unist point, allowed as input.
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
 * Get a line/column-based `point` from `offset`.
 */
export type ToPoint = (offset?: number | null | undefined) => Point
/**
 * Get an offset from a line/column-based `point`.
 */
export type ToOffset = (point?: Point | null | undefined) => number
/**
 * Accessors for index.
 */
export type Location = {
  /**
   *   Get a line/column-based `point` from `offset`.
   */
  toPoint: ToPoint
  /**
   *   Get an offset from a line/column-based `point`.
   */
  toOffset: ToOffset
}
