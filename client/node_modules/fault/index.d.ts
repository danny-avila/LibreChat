/**
 * Create a new `EConstructor`, with the formatted `format` as a first argument.
 *
 * @template {Error} Fault
 * @template {new (reason: string) => Fault} Class
 * @param {Class} Constructor
 */
export function create<
  Fault extends Error,
  Class extends new (reason: string) => Fault
>(
  Constructor: Class
): {
  (format?: string | null | undefined, ...values: unknown[]): Fault
  /** @type {string} */
  displayName: string
}
export const fault: {
  (format?: string | null | undefined, ...values: unknown[]): Error
  /** @type {string} */
  displayName: string
} & {
  eval: {
    (format?: string | null | undefined, ...values: unknown[]): Error
    /** @type {string} */
    displayName: string
  }
  range: {
    (format?: string | null | undefined, ...values: unknown[]): Error
    /** @type {string} */
    displayName: string
  }
  reference: {
    (format?: string | null | undefined, ...values: unknown[]): Error
    /** @type {string} */
    displayName: string
  }
  syntax: {
    (format?: string | null | undefined, ...values: unknown[]): Error
    /** @type {string} */
    displayName: string
  }
  type: {
    (format?: string | null | undefined, ...values: unknown[]): Error
    /** @type {string} */
    displayName: string
  }
  uri: {
    (format?: string | null | undefined, ...values: unknown[]): Error
    /** @type {string} */
    displayName: string
  }
}
