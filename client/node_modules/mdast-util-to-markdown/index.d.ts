import type {Info, State} from './lib/types.js'

/**
 * Interface of registered constructs.
 *
 * When working on extensions that use new constructs, extend the corresponding
 * interface to register its name:
 *
 * ```ts
 * declare module 'mdast-util-to-markdown' {
 *   interface ConstructNameMap {
 *     // Register a new construct name (value is used, key should match it).
 *     gfmStrikethrough: 'gfmStrikethrough'
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface ConstructNameMap {
  /**
   * Whole autolink.
   *
   * ```markdown
   * > | <https://example.com> and <admin@example.com>
   *     ^^^^^^^^^^^^^^^^^^^^^     ^^^^^^^^^^^^^^^^^^^
   * ```
   */
  autolink: 'autolink'
  /**
   * Whole block quote.
   *
   * ```markdown
   * > | > a
   *     ^^^
   * > | b
   *     ^
   * ```
   */
  blockquote: 'blockquote'
  /**
   * Whole code (indented).
   *
   * ```markdown
   * ␠␠␠␠console.log(1)
   * ^^^^^^^^^^^^^^^^^^
   * ```
   */
  codeIndented: 'codeIndented'
  /**
   * Whole code (fenced).
   *
   * ````markdown
   * > | ```js
   *     ^^^^^
   * > | console.log(1)
   *     ^^^^^^^^^^^^^^
   * > | ```
   *     ^^^
   * ````
   */
  codeFenced: 'codeFenced'
  /**
   * Code (fenced) language, when fenced with grave accents.
   *
   * ````markdown
   * > | ```js
   *        ^^
   *   | console.log(1)
   *   | ```
   * ````
   */
  codeFencedLangGraveAccent: 'codeFencedLangGraveAccent'
  /**
   * Code (fenced) language, when fenced with tildes.
   *
   * ````markdown
   * > | ~~~js
   *        ^^
   *   | console.log(1)
   *   | ~~~
   * ````
   */
  codeFencedLangTilde: 'codeFencedLangTilde'
  /**
   * Code (fenced) meta string, when fenced with grave accents.
   *
   * ````markdown
   * > | ```js eval
   *           ^^^^
   *   | console.log(1)
   *   | ```
   * ````
   */
  codeFencedMetaGraveAccent: 'codeFencedMetaGraveAccent'
  /**
   * Code (fenced) meta string, when fenced with tildes.
   *
   * ````markdown
   * > | ~~~js eval
   *           ^^^^
   *   | console.log(1)
   *   | ~~~
   * ````
   */
  codeFencedMetaTilde: 'codeFencedMetaTilde'
  /**
   * Whole definition.
   *
   * ```markdown
   * > | [a]: b "c"
   *     ^^^^^^^^^^
   * ```
   */
  definition: 'definition'
  /**
   * Destination (literal) (occurs in definition, image, link).
   *
   * ```markdown
   * > | [a]: <b> "c"
   *          ^^^
   * > | a ![b](<c> "d") e
   *            ^^^
   * ```
   */
  destinationLiteral: 'destinationLiteral'
  /**
   * Destination (raw) (occurs in definition, image, link).
   *
   * ```markdown
   * > | [a]: b "c"
   *          ^
   * > | a ![b](c "d") e
   *            ^
   * ```
   */
  destinationRaw: 'destinationRaw'
  /**
   * Emphasis.
   *
   * ```markdown
   * > | *a*
   *     ^^^
   * ```
   */
  emphasis: 'emphasis'
  /**
   * Whole heading (atx).
   *
   * ```markdown
   * > | # alpha
   *     ^^^^^^^
   * ```
   */
  headingAtx: 'headingAtx'
  /**
   * Whole heading (setext).
   *
   * ```markdown
   * > | alpha
   *     ^^^^^
   * > | =====
   *     ^^^^^
   * ```
   */
  headingSetext: 'headingSetext'
  /**
   * Whole image.
   *
   * ```markdown
   * > | ![a](b)
   *     ^^^^^^^
   * > | ![c]
   *     ^^^^
   * ```
   */
  image: 'image'
  /**
   * Whole image reference.
   *
   * ```markdown
   * > | ![a]
   *     ^^^^
   * ```
   */
  imageReference: 'imageReference'
  /**
   * Label (occurs in definitions, image reference, image, link reference,
   * link).
   *
   * ```markdown
   * > | [a]: b "c"
   *     ^^^
   * > | a [b] c
   *       ^^^
   * > | a ![b][c] d
   *       ^^^^
   * > | a [b](c) d
   *       ^^^
   * ```
   */
  label: 'label'
  /**
   * Whole link.
   *
   * ```markdown
   * > | [a](b)
   *     ^^^^^^
   * > | [c]
   *     ^^^
   * ```
   */
  link: 'link'
  /**
   * Whole link reference.
   *
   * ```markdown
   * > | [a]
   *     ^^^
   * ```
   */
  linkReference: 'linkReference'
  /**
   * List.
   *
   * ```markdown
   * > | * a
   *     ^^^
   * > | 1. b
   *     ^^^^
   * ```
   */
  list: 'list'
  /**
   * List item.
   *
   * ```markdown
   * > | * a
   *     ^^^
   * > | 1. b
   *     ^^^^
   * ```
   */
  listItem: 'listItem'
  /**
   * Paragraph.
   *
   * ```markdown
   * > | a b
   *     ^^^
   * > | c.
   *     ^^
   * ```
   */
  paragraph: 'paragraph'
  /**
   * Phrasing (occurs in headings, paragraphs, etc).
   *
   * ```markdown
   * > | a
   *     ^
   * ```
   */
  phrasing: 'phrasing'
  /**
   * Reference (occurs in image, link).
   *
   * ```markdown
   * > | [a][]
   *        ^^
   * ```
   */
  reference: 'reference'
  /**
   * Strong.
   *
   * ```markdown
   * > | **a**
   *     ^^^^^
   * ```
   */
  strong: 'strong'
  /**
   * Title using single quotes (occurs in definition, image, link).
   *
   * ```markdown
   * > | [a](b 'c')
   *           ^^^
   * ```
   */
  titleApostrophe: 'titleApostrophe'
  /**
   * Title using double quotes (occurs in definition, image, link).
   *
   * ```markdown
   * > | [a](b "c")
   *           ^^^
   * ```
   */
  titleQuote: 'titleQuote'
}

/**
 * Construct names for things generated by `mdast-util-to-markdown`.
 *
 * This is an enum of strings, each being a semantic label, useful to know when
 * serializing whether we’re for example in a double (`"`) or single (`'`)
 * quoted title.
 */
export type ConstructName = ConstructNameMap[keyof ConstructNameMap]

export {toMarkdown} from './lib/index.js'
export {handle as defaultHandlers} from './lib/handle/index.js'
export type {
  Handle,
  Handlers,
  Info,
  Join,
  Map,
  Options,
  SafeConfig,
  State,
  Tracker,
  Unsafe
} from './lib/types.js'
// Deprecated.
export type SafeOptions = Info
export type Context = State
