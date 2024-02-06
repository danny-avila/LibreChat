/**
 * @typedef {import('vfile').VFile} VFile
 * @typedef {import('parse5').Document} P5Document
 * @typedef {import('parse5').DocumentFragment} P5Fragment
 * @typedef {Omit<import('parse5').Element, 'parentNode'>} P5Element
 * @typedef {import('parse5').Attribute} P5Attribute
 * @typedef {Omit<import('parse5').Location, 'startOffset' | 'endOffset'> & {startOffset: number|undefined, endOffset: number|undefined}} P5Location
 * @typedef {import('parse5').ParserOptions} P5ParserOptions
 * @typedef {import('hast').Root} Root
 * @typedef {import('hast').DocType} Doctype
 * @typedef {import('hast').Element} Element
 * @typedef {import('hast').Text} Text
 * @typedef {import('hast').Comment} Comment
 * @typedef {import('hast').Content} Content
 * @typedef {Root|Content} Node
 * @typedef {import('../complex-types').Raw} Raw
 *
 * @typedef {Omit<Comment, 'value'> & {value: {stitch: Node}}} Stitch
 *
 * @typedef Options
 * @property {Array<string>} [passThrough]
 *   List of custom hast node types to pass through (keep) in hast.
 *   If the passed through nodes have children, those children are expected to
 *   be hast and will be handled.
 *
 * @typedef HiddenTokenizer
 * @property {Array<HiddenLocationTracker>} __mixins
 *   Way too simple, but works for us.
 * @property {HiddenPreprocessor} preprocessor
 * @property {(value: string) => void} write
 * @property {() => number} _consume
 * @property {Array<HiddenToken>} tokenQueue
 * @property {string} state
 * @property {string} returnState
 * @property {number} charRefCode
 * @property {Array<number>} tempBuff
 * @property {Function} _flushCodePointsConsumedAsCharacterReference
 * @property {string} lastStartTagName
 * @property {number} consumedAfterSnapshot
 * @property {boolean} active
 * @property {HiddenToken|undefined} currentCharacterToken
 * @property {HiddenToken|undefined} currentToken
 * @property {unknown} currentAttr
 * @property {Function} NAMED_CHARACTER_REFERENCE_STATE
 * @property {Function} NUMERIC_CHARACTER_REFERENCE_END_STATE
 *
 * @typedef {Record<string, unknown> & {location: P5Location}} HiddenToken
 *
 * @typedef HiddenPreprocessor
 * @property {string|undefined} html
 * @property {number} pos
 * @property {number} lastGapPos
 * @property {number} lastCharPos
 * @property {Array<number>} gapStack
 * @property {boolean} skipNextNewLine
 * @property {boolean} lastChunkWritten
 * @property {boolean} endOfChunkHit
 *
 * @typedef HiddenLocationTracker
 * @property {P5Location|undefined} currentAttrLocation
 * @property {P5Location} ctLoc
 * @property {HiddenPosTracker} posTracker
 *
 * @typedef HiddenPosTracker
 * @property {boolean} isEol
 * @property {number} lineStartPos
 * @property {number} droppedBufferSize
 * @property {number} offset
 * @property {number} col
 * @property {number} line
 */

// @ts-expect-error: untyped.
import Parser from 'parse5/lib/parser/index.js'
import {pointStart, pointEnd} from 'unist-util-position'
import {visit} from 'unist-util-visit'
import {fromParse5} from 'hast-util-from-parse5'
import {toParse5} from 'hast-util-to-parse5'
import {htmlVoidElements} from 'html-void-elements'
import {webNamespaces} from 'web-namespaces'
import {zwitch} from 'zwitch'

const inTemplateMode = 'IN_TEMPLATE_MODE'
const dataState = 'DATA_STATE'
const characterToken = 'CHARACTER_TOKEN'
const startTagToken = 'START_TAG_TOKEN'
const endTagToken = 'END_TAG_TOKEN'
const commentToken = 'COMMENT_TOKEN'
const doctypeToken = 'DOCTYPE_TOKEN'

/** @type {P5ParserOptions} */
const parseOptions = {sourceCodeLocationInfo: true, scriptingEnabled: false}

/**
 * Given a hast tree and an optional vfile (for positional info), return a new
 * parsed-again hast tree.
 *
 * @param tree
 *   Original hast tree.
 * @param file
 *   Virtual file for positional info, optional.
 * @param options
 *   Configuration.
 */
export const raw =
  /**
   * @type {(
   *   ((tree: Node, file: VFile|undefined, options?: Options) => Node) &
   *   ((tree: Node, options?: Options) => Node)
   * )}
   */
  (
    /**
     * @param {Node} tree
     * @param {VFile} [file]
     * @param {Options} [options]
     */
    function (tree, file, options) {
      let index = -1
      const parser = new Parser(parseOptions)
      const one = zwitch('type', {
        handlers: {root, element, text, comment, doctype, raw: handleRaw},
        // @ts-expect-error: hush.
        unknown
      })
      /** @type {boolean|undefined} */
      let stitches
      /** @type {HiddenTokenizer|undefined} */
      let tokenizer
      /** @type {HiddenPreprocessor|undefined} */
      let preprocessor
      /** @type {HiddenPosTracker|undefined} */
      let posTracker
      /** @type {HiddenLocationTracker|undefined} */
      let locationTracker

      if (isOptions(file)) {
        options = file
        file = undefined
      }

      if (options && options.passThrough) {
        while (++index < options.passThrough.length) {
          // @ts-expect-error: hush.
          one.handlers[options.passThrough[index]] = stitch
        }
      }

      const result = fromParse5(
        documentMode(tree) ? document() : fragment(),
        file
      )

      if (stitches) {
        visit(result, 'comment', (node, index, parent) => {
          const stitch = /** @type {Stitch} */ (/** @type {unknown} */ (node))
          if (stitch.value.stitch && parent !== null && index !== null) {
            // @ts-expect-error: assume the stitch is allowed.
            parent.children[index] = stitch.value.stitch
            return index
          }
        })
      }

      // Unpack if possible and when not given a `root`.
      if (
        tree.type !== 'root' &&
        result.type === 'root' &&
        result.children.length === 1
      ) {
        return result.children[0]
      }

      return result

      /**
       * @returns {P5Fragment}
       */
      function fragment() {
        /** @type {P5Element} */
        const context = {
          nodeName: 'template',
          tagName: 'template',
          attrs: [],
          namespaceURI: webNamespaces.html,
          childNodes: []
        }
        /** @type {P5Element} */
        const mock = {
          nodeName: 'documentmock',
          tagName: 'documentmock',
          attrs: [],
          namespaceURI: webNamespaces.html,
          childNodes: []
        }
        /** @type {P5Fragment} */
        const doc = {nodeName: '#document-fragment', childNodes: []}

        parser._bootstrap(mock, context)
        parser._pushTmplInsertionMode(inTemplateMode)
        parser._initTokenizerForFragmentParsing()
        parser._insertFakeRootElement()
        parser._resetInsertionMode()
        parser._findFormInFragmentContext()

        tokenizer = parser.tokenizer
        /* c8 ignore next */
        if (!tokenizer) throw new Error('Expected `tokenizer`')
        preprocessor = tokenizer.preprocessor
        locationTracker = tokenizer.__mixins[0]
        posTracker = locationTracker.posTracker

        one(tree)

        resetTokenizer()

        parser._adoptNodes(mock.childNodes[0], doc)

        return doc
      }

      /**
       * @returns {P5Document}
       */
      function document() {
        /** @type {P5Document} */
        const doc = parser.treeAdapter.createDocument()

        parser._bootstrap(doc, undefined)
        tokenizer = parser.tokenizer
        /* c8 ignore next */
        if (!tokenizer) throw new Error('Expected `tokenizer`')
        preprocessor = tokenizer.preprocessor
        locationTracker = tokenizer.__mixins[0]
        posTracker = locationTracker.posTracker

        one(tree)

        resetTokenizer()

        return doc
      }

      /**
       * @param {Array<Content>} nodes
       * @returns {void}
       */
      function all(nodes) {
        let index = -1

        /* istanbul ignore else - invalid nodes, see rehypejs/rehype-raw#7. */
        if (nodes) {
          while (++index < nodes.length) {
            one(nodes[index])
          }
        }
      }

      /**
       * @param {Root} node
       * @returns {void}
       */
      function root(node) {
        all(node.children)
      }

      /**
       * @param {Element} node
       * @returns {void}
       */
      function element(node) {
        resetTokenizer()
        parser._processInputToken(startTag(node))

        all(node.children)

        if (!htmlVoidElements.includes(node.tagName)) {
          resetTokenizer()
          parser._processInputToken(endTag(node))
        }
      }

      /**
       * @param {Text} node
       * @returns {void}
       */
      function text(node) {
        resetTokenizer()
        parser._processInputToken({
          type: characterToken,
          chars: node.value,
          location: createParse5Location(node)
        })
      }

      /**
       * @param {Doctype} node
       * @returns {void}
       */
      function doctype(node) {
        resetTokenizer()
        parser._processInputToken({
          type: doctypeToken,
          name: 'html',
          forceQuirks: false,
          publicId: '',
          systemId: '',
          location: createParse5Location(node)
        })
      }

      /**
       * @param {Comment|Stitch} node
       * @returns {void}
       */
      function comment(node) {
        resetTokenizer()
        parser._processInputToken({
          type: commentToken,
          data: node.value,
          location: createParse5Location(node)
        })
      }

      /**
       * @param {Raw} node
       * @returns {void}
       */
      function handleRaw(node) {
        const start = pointStart(node)
        const line = start.line || 1
        const column = start.column || 1
        const offset = start.offset || 0

        /* c8 ignore next 4 */
        if (!preprocessor) throw new Error('Expected `preprocessor`')
        if (!tokenizer) throw new Error('Expected `tokenizer`')
        if (!posTracker) throw new Error('Expected `posTracker`')
        if (!locationTracker) throw new Error('Expected `locationTracker`')

        // Reset preprocessor:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/tokenizer/preprocessor.js#L17>.
        preprocessor.html = undefined
        preprocessor.pos = -1
        preprocessor.lastGapPos = -1
        preprocessor.lastCharPos = -1
        preprocessor.gapStack = []
        preprocessor.skipNextNewLine = false
        preprocessor.lastChunkWritten = false
        preprocessor.endOfChunkHit = false

        // Reset preprocessor mixin:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/extensions/position-tracking/preprocessor-mixin.js>.
        posTracker.isEol = false
        posTracker.lineStartPos = -column + 1 // Looks weird, but ensures we get correct positional info.
        posTracker.droppedBufferSize = offset
        posTracker.offset = 0
        posTracker.col = 1
        posTracker.line = line

        // Reset location tracker:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/extensions/location-info/tokenizer-mixin.js>.
        locationTracker.currentAttrLocation = undefined
        locationTracker.ctLoc = createParse5Location(node)

        // See the code for `parse` and `parseFragment`:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/parser/index.js#L371>.
        tokenizer.write(node.value)
        parser._runParsingLoop(null)

        // Character references hang, so if we ended there, we need to flush
        // those too.
        // We reset the preprocessor as if the document ends here.
        // Then one single call to the relevant state does the trick, parse5
        // consumes the whole token.
        if (
          tokenizer.state === 'NAMED_CHARACTER_REFERENCE_STATE' ||
          tokenizer.state === 'NUMERIC_CHARACTER_REFERENCE_END_STATE'
        ) {
          preprocessor.lastChunkWritten = true
          tokenizer[tokenizer.state](tokenizer._consume())
        }
      }

      /**
       * @param {Node} node
       */
      function stitch(node) {
        stitches = true

        /** @type {Node} */
        let clone

        // Recurse, because to somewhat handle `[<x>]</x>` (where `[]` denotes the
        // passed through node).
        if ('children' in node) {
          clone = {
            ...node,
            children: raw(
              {type: 'root', children: node.children},
              file,
              options
              // @ts-expect-error Assume a given parent yields a parent.
            ).children
          }
        } else {
          clone = {...node}
        }

        // Hack: `value` is supposed to be a string, but as none of the tools
        // (`parse5` or `hast-util-from-parse5`) looks at it, we can pass nodes
        // through.
        comment({type: 'comment', value: {stitch: clone}})
      }

      function resetTokenizer() {
        /* c8 ignore next 2 */
        if (!tokenizer) throw new Error('Expected `tokenizer`')
        if (!posTracker) throw new Error('Expected `posTracker`')

        // Process final characters if they’re still there after hibernating.
        // Similar to:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/extensions/location-info/tokenizer-mixin.js#L95>.
        const token = tokenizer.currentCharacterToken

        if (token) {
          token.location.endLine = posTracker.line
          token.location.endCol = posTracker.col + 1
          token.location.endOffset = posTracker.offset + 1
          parser._processInputToken(token)
        }

        // Reset tokenizer:
        // See: <https://github.com/inikulin/parse5/blob/9c683e1/packages/parse5/lib/tokenizer/index.js#L218-L234>.
        // Especially putting it back in the `data` state is useful: some elements,
        // like textareas and iframes, change the state.
        // See GH-7.
        // But also if broken HTML is in `raw`, and then a correct element is given.
        // See GH-11.
        tokenizer.tokenQueue = []
        tokenizer.state = dataState
        tokenizer.returnState = ''
        tokenizer.charRefCode = -1
        tokenizer.tempBuff = []
        tokenizer.lastStartTagName = ''
        tokenizer.consumedAfterSnapshot = -1
        tokenizer.active = false
        tokenizer.currentCharacterToken = undefined
        tokenizer.currentToken = undefined
        tokenizer.currentAttr = undefined
      }
    }
  )
/**
 * @param {Element} node
 * @returns {HiddenToken}
 */
function startTag(node) {
  /** @type {P5Location} */
  const location = Object.assign(createParse5Location(node))
  // @ts-expect-error extra positional info.
  location.startTag = Object.assign({}, location)

  // Untyped token.
  return {
    type: startTagToken,
    tagName: node.tagName,
    selfClosing: false,
    attrs: attributes(node),
    location
  }
}

/**
 * @param {Element} node
 * @returns {Array<P5Attribute>}
 */
function attributes(node) {
  return toParse5({
    tagName: node.tagName,
    type: 'element',
    properties: node.properties,
    children: []
    // @ts-expect-error Assume element.
  }).attrs
}

/**
 * @param {Element} node
 * @returns {HiddenToken}
 */
function endTag(node) {
  /** @type {P5Location} */
  const location = Object.assign(createParse5Location(node))
  // @ts-expect-error extra positional info.
  location.startTag = Object.assign({}, location)

  // Untyped token.
  return {
    type: endTagToken,
    tagName: node.tagName,
    attrs: [],
    location
  }
}

/**
 * @param {Node} node
 */
function unknown(node) {
  throw new Error('Cannot compile `' + node.type + '` node')
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function documentMode(node) {
  const head = node.type === 'root' ? node.children[0] : node
  return Boolean(
    head &&
      (head.type === 'doctype' ||
        (head.type === 'element' && head.tagName === 'html'))
  )
}

/**
 * @param {Node|Stitch} node
 * @returns {P5Location}
 */
function createParse5Location(node) {
  const start = pointStart(node)
  const end = pointEnd(node)

  return {
    startLine: start.line,
    startCol: start.column,
    startOffset: start.offset,
    endLine: end.line,
    endCol: end.column,
    endOffset: end.offset
  }
}

/**
 * @param {VFile|Options|undefined} value
 * @return {value is Options}
 */
function isOptions(value) {
  return Boolean(value && !('message' in value && 'messages' in value))
}
