/**
 * @typedef {import('unist').Parent} Parent
 * @typedef {import('hast').Element} Element
 */
/**
 * @typedef {null | undefined | string | TestFunctionAnything | Array<string | TestFunctionAnything>} Test
 *   Check for an arbitrary element, unaware of TypeScript inferral.
 *
 * @callback TestFunctionAnything
 *   Check if an element passes a test, unaware of TypeScript inferral.
 * @param {Element} element
 *   An element.
 * @param {number | null | undefined} [index]
 *   The element’s position in its parent.
 * @param {Parent | null | undefined} [parent]
 *   The element’s parent.
 * @returns {boolean | void}
 *   Whether this element passes the test.
 */
/**
 * @template {Element} T
 *   Element type.
 * @typedef {T['tagName'] | TestFunctionPredicate<T> | Array<T['tagName'] | TestFunctionPredicate<T>>} PredicateTest
 *   Check for an element that can be inferred by TypeScript.
 */
/**
 * Check if an element passes a certain node test.
 *
 * @template {Element} T
 *   Element type.
 * @callback TestFunctionPredicate
 *   Complex test function for an element that can be inferred by TypeScript.
 * @param {Element} element
 *   An element.
 * @param {number | null | undefined} [index]
 *   The element’s position in its parent.
 * @param {Parent | null | undefined} [parent]
 *   The element’s parent.
 * @returns {element is T}
 *   Whether this element passes the test.
 */
/**
 * @callback AssertAnything
 *   Check that an arbitrary value is an element, unaware of TypeScript inferral.
 * @param {unknown} [node]
 *   Anything (typically a node).
 * @param {number | null | undefined} [index]
 *   The node’s position in its parent.
 * @param {Parent | null | undefined} [parent]
 *   The node’s parent.
 * @returns {boolean}
 *   Whether this is an element and passes a test.
 */
/**
 * Check if a node is an element and passes a certain node test
 *
 * @template {Element} T
 *   Element type.
 * @callback AssertPredicate
 *   Check that an arbitrary value is a specific element, aware of TypeScript.
 * @param {unknown} [node]
 *   Anything (typically a node).
 * @param {number | null | undefined} [index]
 *   The node’s position in its parent.
 * @param {Parent | null | undefined} [parent]
 *   The node’s parent.
 * @returns {node is T}
 *   Whether this is an element and passes a test.
 */
/**
 * Check if `node` is an `Element` and whether it passes the given test.
 *
 * @param node
 *   Thing to check, typically `Node`.
 * @param test
 *   A check for a specific element.
 * @param index
 *   The node’s position in its parent.
 * @param parent
 *   The node’s parent.
 * @returns
 *   Whether `node` is an element and passes a test.
 */
export const isElement: (() => false) &
  (<T extends import('hast').Element = import('hast').Element>(
    node: unknown,
    test?: PredicateTest<T> | undefined,
    index?: number,
    parent?: Parent,
    context?: unknown
  ) => node is T) &
  ((
    node: unknown,
    test: Test,
    index?: number,
    parent?: Parent,
    context?: unknown
  ) => boolean)
/**
 * Generate an assertion from a test.
 *
 * Useful if you’re going to test many nodes, for example when creating a
 * utility where something else passes a compatible test.
 *
 * The created function is a bit faster because it expects valid input only:
 * a `node`, `index`, and `parent`.
 *
 * @param test
 *   *  When nullish, checks if `node` is an `Element`.
 *   *  When `string`, works like passing `(element) => element.tagName === test`.
 *   *  When `function` checks if function passed the element is true.
 *   *  When `array`, checks any one of the subtests pass.
 * @returns
 *   An assertion.
 */
export const convertElement: (<T extends import('hast').Element>(
  test: T['tagName'] | TestFunctionPredicate<T>
) => AssertPredicate<T>) &
  ((test?: Test) => AssertAnything)
export type Parent = import('unist').Parent
export type Element = import('hast').Element
/**
 * Check for an arbitrary element, unaware of TypeScript inferral.
 */
export type Test =
  | null
  | undefined
  | string
  | TestFunctionAnything
  | Array<string | TestFunctionAnything>
/**
 * Check if an element passes a test, unaware of TypeScript inferral.
 */
export type TestFunctionAnything = (
  element: Element,
  index?: number | null | undefined,
  parent?: Parent | null | undefined
) => boolean | void
/**
 * Check for an element that can be inferred by TypeScript.
 */
export type PredicateTest<T extends import('hast').Element> =
  | T['tagName']
  | TestFunctionPredicate<T>
  | Array<T['tagName'] | TestFunctionPredicate<T>>
/**
 * Complex test function for an element that can be inferred by TypeScript.
 */
export type TestFunctionPredicate<T extends import('hast').Element> = (
  element: Element,
  index?: number | null | undefined,
  parent?: Parent | null | undefined
) => element is T
/**
 * Check that an arbitrary value is an element, unaware of TypeScript inferral.
 */
export type AssertAnything = (
  node?: unknown,
  index?: number | null | undefined,
  parent?: Parent | null | undefined
) => boolean
/**
 * Check that an arbitrary value is a specific element, aware of TypeScript.
 */
export type AssertPredicate<T extends import('hast').Element> = (
  node?: unknown,
  index?: number | null | undefined,
  parent?: Parent | null | undefined
) => node is T
