/**
 * @typedef {import('./lib/index.js').Test} Test
 * @typedef {import('./lib/index.js').TestFunctionAnything} TestFunctionAnything
 * @typedef {import('./lib/index.js').AssertAnything} AssertAnything
 */

/**
 * @template {import('unist').Node} Kind
 * @typedef {import('./lib/index.js').PredicateTest<Kind>} PredicateTest
 */

/**
 * @template {import('unist').Node} Kind
 * @typedef {import('./lib/index.js').TestFunctionPredicate<Kind>} TestFunctionPredicate
 */

/**
 * @template {import('unist').Node} Kind
 * @typedef {import('./lib/index.js').AssertPredicate<Kind>} AssertPredicate
 */

export {is, convert} from './lib/index.js'
