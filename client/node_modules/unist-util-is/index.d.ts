export type Test = import('./lib/index.js').Test
export type TestFunctionAnything = import('./lib/index.js').TestFunctionAnything
export type AssertAnything = import('./lib/index.js').AssertAnything
export type PredicateTest<
  Kind extends import('unist').Node<import('unist').Data>
> = import('./lib/index.js').PredicateTest<Kind>
export type TestFunctionPredicate<
  Kind extends import('unist').Node<import('unist').Data>
> = import('./lib/index.js').TestFunctionPredicate<Kind>
export type AssertPredicate<
  Kind extends import('unist').Node<import('unist').Data>
> = import('./lib/index.js').AssertPredicate<Kind>
export {is, convert} from './lib/index.js'
