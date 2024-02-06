// @ts-expect-error
import formatter from 'format'

export const fault = Object.assign(create(Error), {
  eval: create(EvalError),
  range: create(RangeError),
  reference: create(ReferenceError),
  syntax: create(SyntaxError),
  type: create(TypeError),
  uri: create(URIError)
})

/**
 * Create a new `EConstructor`, with the formatted `format` as a first argument.
 *
 * @template {Error} Fault
 * @template {new (reason: string) => Fault} Class
 * @param {Class} Constructor
 */
export function create(Constructor) {
  /** @type {string} */
  // @ts-expect-error
  FormattedError.displayName = Constructor.displayName || Constructor.name

  return FormattedError

  /**
   * Create an error with a printf-like formatted message.
   *
   * @param {string|null} [format]
   *   Template string.
   * @param {...unknown} values
   *   Values to render in `format`.
   * @returns {Fault}
   */
  function FormattedError(format, ...values) {
    /** @type {string} */
    const reason = format ? formatter(format, ...values) : format
    return new Constructor(reason)
  }
}
