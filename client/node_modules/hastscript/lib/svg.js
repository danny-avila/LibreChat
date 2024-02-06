/**
 * @typedef {import('./core.js').HChild} Child
 *   Acceptable child value.
 * @typedef {import('./core.js').HProperties} Properties
 *   Acceptable value for element properties.
 * @typedef {import('./core.js').HResult} Result
 *   Result from a `h` (or `s`) call.
 *
 * @typedef {import('./jsx-classic.js').Element} s.JSX.Element
 * @typedef {import('./jsx-classic.js').IntrinsicAttributes} s.JSX.IntrinsicAttributes
 * @typedef {import('./jsx-classic.js').IntrinsicElements} s.JSX.IntrinsicElements
 * @typedef {import('./jsx-classic.js').ElementChildrenAttribute} s.JSX.ElementChildrenAttribute
 */

import {svg} from 'property-information'
import {core} from './core.js'
import {svgCaseSensitiveTagNames} from './svg-case-sensitive-tag-names.js'

export const s = core(svg, 'g', svgCaseSensitiveTagNames)
