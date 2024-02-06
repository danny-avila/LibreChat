/**
 * @typedef {import('unist').Node} Node
 * @typedef {import('unist').Parent} Parent
 */
/**
 * @typedef {Record<string, unknown>} Props
 * @typedef {null | undefined | string | Props | TestFunctionAnything | Array<string | Props | TestFunctionAnything>} Test
 *   Check for an arbitrary node, unaware of TypeScript inferral.
 *
 * @callback TestFunctionAnything
 *   Check if a node passes a test, unaware of TypeScript inferral.
 * @param {unknown} this
 *   The given context.
 * @param {Node} node
 *   A node.
 * @param {number | null | undefined} [index]
 *   The node’s position in its parent.
 * @param {Parent | null | undefined} [parent]
 *   The node’s parent.
 * @returns {boolean | void}
 *   Whether this node passes the test.
 */
/**
 * @template {Node} Kind
 *   Node type.
 * @typedef {Kind['type'] | Partial<Kind> | TestFunctionPredicate<Kind> | Array<Kind['type'] | Partial<Kind> | TestFunctionPredicate<Kind>>} PredicateTest
 *   Check for a node that can be inferred by TypeScript.
 */
/**
 * Check if a node passes a certain test.
 *
 * @template {Node} Kind
 *   Node type.
 * @callback TestFunctionPredicate
 *   Complex test function for a node that can be inferred by TypeScript.
 * @param {Node} node
 *   A node.
 * @param {number | null | undefined} [index]
 *   The node’s position in its parent.
 * @param {Parent | null | undefined} [parent]
 *   The node’s parent.
 * @returns {node is Kind}
 *   Whether this node passes the test.
 */
/**
 * @callback AssertAnything
 *   Check that an arbitrary value is a node, unaware of TypeScript inferral.
 * @param {unknown} [node]
 *   Anything (typically a node).
 * @param {number | null | undefined} [index]
 *   The node’s position in its parent.
 * @param {Parent | null | undefined} [parent]
 *   The node’s parent.
 * @returns {boolean}
 *   Whether this is a node and passes a test.
 */
/**
 * Check if a node is a node and passes a certain node test.
 *
 * @template {Node} Kind
 *   Node type.
 * @callback AssertPredicate
 *   Check that an arbitrary value is a specific node, aware of TypeScript.
 * @param {unknown} [node]
 *   Anything (typically a node).
 * @param {number | null | undefined} [index]
 *   The node’s position in its parent.
 * @param {Parent | null | undefined} [parent]
 *   The node’s parent.
 * @returns {node is Kind}
 *   Whether this is a node and passes a test.
 */
/**
 * Check if `node` is a `Node` and whether it passes the given test.
 *
 * @param node
 *   Thing to check, typically `Node`.
 * @param test
 *   A check for a specific node.
 * @param index
 *   The node’s position in its parent.
 * @param parent
 *   The node’s parent.
 * @returns
 *   Whether `node` is a node and passes a test.
 */
export const is: (() => false) &
  (<
    Kind extends import('unist').Node<
      import('unist').Data
    > = import('unist').Node<import('unist').Data>
  >(
    node: unknown,
    test: PredicateTest<Kind>,
    index: number,
    parent: Parent,
    context?: unknown
  ) => node is Kind) &
  (<
    Kind_1 extends import('unist').Node<
      import('unist').Data
    > = import('unist').Node<import('unist').Data>
  >(
    node: unknown,
    test: PredicateTest<Kind_1>,
    index?: null | undefined,
    parent?: null | undefined,
    context?: unknown
  ) => node is Kind_1) &
  ((
    node: unknown,
    test: Test,
    index: number,
    parent: Parent,
    context?: unknown
  ) => boolean) &
  ((
    node: unknown,
    test?: Test,
    index?: null | undefined,
    parent?: null | undefined,
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
 *   *   when nullish, checks if `node` is a `Node`.
 *   *   when `string`, works like passing `(node) => node.type === test`.
 *   *   when `function` checks if function passed the node is true.
 *   *   when `object`, checks that all keys in test are in node, and that they have (strictly) equal values.
 *   *   when `array`, checks if any one of the subtests pass.
 * @returns
 *   An assertion.
 */
export const convert: (<
  Kind extends import('unist').Node<import('unist').Data>
>(
  test: PredicateTest<Kind>
) => AssertPredicate<Kind>) &
  ((test?: Test) => AssertAnything)
export type Node = import('unist').Node
export type Parent = import('unist').Parent
export type Props = Record<string, unknown>
/**
 * Check for an arbitrary node, unaware of TypeScript inferral.
 */
export type Test =
  | null
  | undefined
  | string
  | Props
  | TestFunctionAnything
  | Array<string | Props | TestFunctionAnything>
/**
 * Check if a node passes a test, unaware of TypeScript inferral.
 */
export type TestFunctionAnything = (
  this: unknown,
  node: Node,
  index?: number | null | undefined,
  parent?: Parent | null | undefined
) => boolean | void
/**
 * Check for a node that can be inferred by TypeScript.
 */
export type PredicateTest<
  Kind extends import('unist').Node<import('unist').Data>
> =
  | Kind['type']
  | Partial<Kind>
  | TestFunctionPredicate<Kind>
  | Array<Kind['type'] | Partial<Kind> | TestFunctionPredicate<Kind>>
/**
 * Complex test function for a node that can be inferred by TypeScript.
 */
export type TestFunctionPredicate<
  Kind extends import('unist').Node<import('unist').Data>
> = (
  node: Node,
  index?: number | null | undefined,
  parent?: Parent | null | undefined
) => node is Kind
/**
 * Check that an arbitrary value is a node, unaware of TypeScript inferral.
 */
export type AssertAnything = (
  node?: unknown,
  index?: number | null | undefined,
  parent?: Parent | null | undefined
) => boolean
/**
 * Check that an arbitrary value is a specific node, aware of TypeScript.
 */
export type AssertPredicate<
  Kind extends import('unist').Node<import('unist').Data>
> = (
  node?: unknown,
  index?: number | null | undefined,
  parent?: Parent | null | undefined
) => node is Kind
