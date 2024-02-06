/**
 * @typedef {import('unist').Parent} UnistParent
 * @typedef {import('unist').Point} Point
 * @typedef {import('mdast').Association} Association
 * @typedef {import('mdast').Content} Content
 * @typedef {import('mdast').ListContent} ListContent
 * @typedef {import('mdast').PhrasingContent} PhrasingContent
 * @typedef {import('mdast').Root} Root
 * @typedef {import('mdast').TopLevelContent} TopLevelContent
 * @typedef {import('../index.js').ConstructName} ConstructName
 */

/**
 * @typedef {Root | Content} Node
 * @typedef {Extract<Node, UnistParent>} Parent
 * @typedef {TopLevelContent | ListContent} FlowContent
 *
 * @typedef TrackFields
 *   Info on where we are in the document we are generating.
 * @property {Point} now
 *   Current point.
 * @property {number} lineShift
 *   Number of columns each line will be shifted by wrapping nodes.
 *
 * @typedef SafeFields
 *   Info on the characters that are around the current thing we are
 *   generating.
 * @property {string} before
 *   Characters before this (guaranteed to be one, can be more).
 * @property {string} after
 *   Characters after this (guaranteed to be one, can be more).
 *
 * @typedef {TrackFields & SafeFields} Info
 *   Info on the surrounding of the node that is serialized.
 *
 * @callback TrackCurrent
 *   Get current tracked info.
 * @returns {TrackFields}
 *   Current tracked info.
 *
 * @callback TrackShift
 *   Define a relative increased line shift (the typical indent for lines).
 * @param {number} value
 *   Relative increment in how much each line will be padded.
 * @returns {void}
 *   Nothing.
 *
 * @callback TrackMove
 *   Move past some generated markdown.
 * @param {string | null | undefined} value
 *   Generated markdown.
 * @returns {string}
 *   Given markdown.
 *
 * @typedef Tracker
 *   Track positional info in the output.
 *
 *   This info isn’t used yet but such functionality will allow line wrapping,
 *   source maps, etc.
 * @property {TrackCurrent} current
 *   Get the current tracked info.
 * @property {TrackShift} shift
 *   Define an increased line shift (the typical indent for lines).
 * @property {TrackMove} move
 *   Move past some generated markdown.
 *
 * @callback CreateTracker
 *   Track positional info in the output.
 *
 *   This info isn’t used yet but such functionality will allow line wrapping,
 *   source maps, etc.
 * @param {TrackFields} info
 *   Info on where we are in the document we are generating.
 * @returns {Tracker}
 *   Tracker.
 *
 * @callback AssociationId
 *   Get an identifier from an association to match it to others.
 *
 *   Associations are nodes that match to something else through an ID:
 *   <https://github.com/syntax-tree/mdast#association>.
 *
 *   The `label` of an association is the string value: character escapes and
 *   references work, and casing is intact.
 *   The `identifier` is used to match one association to another:
 *   controversially, character escapes and references don’t work in this
 *   matching: `&copy;` does not match `©`, and `\+` does not match `+`.
 *
 *   But casing is ignored (and whitespace) is trimmed and collapsed: ` A\nb`
 *   matches `a b`.
 *   So, we do prefer the label when figuring out how we’re going to serialize:
 *   it has whitespace, casing, and we can ignore most useless character
 *   escapes and all character references.
 * @param {Association} node
 *   Node that includes an association.
 * @returns {string}
 *   ID.
 *
 * @callback Map
 *   Map function to pad a single line.
 * @param {string} value
 *   A single line of serialized markdown.
 * @param {number} line
 *   Line number relative to the fragment.
 * @param {boolean} blank
 *   Whether the line is considered blank in markdown.
 * @returns {string}
 *   Padded line.
 *
 * @callback IndentLines
 *   Pad serialized markdown.
 * @param {string} value
 *   Whole fragment of serialized markdown.
 * @param {Map} map
 *   Map function.
 * @returns {string}
 *   Padded value.
 *
 * @callback ContainerPhrasing
 *   Serialize the children of a parent that contains phrasing children.
 *
 *   These children will be joined flush together.
 * @param {Parent & {children: Array<PhrasingContent>}} parent
 *   Parent of flow nodes.
 * @param {Info} info
 *   Info on where we are in the document we are generating.
 * @returns {string}
 *   Serialized children, joined together.
 *
 * @callback ContainerFlow
 *   Serialize the children of a parent that contains flow children.
 *
 *   These children will typically be joined by blank lines.
 *   What they are joined by exactly is defined by `Join` functions.
 * @param {Parent & {children: Array<FlowContent>}} parent
 *   Parent of flow nodes.
 * @param {TrackFields} info
 *   Info on where we are in the document we are generating.
 * @returns {string}
 *   Serialized children, joined by (blank) lines.
 *
 * @typedef SafeEncodeFields
 *   Extra configuration for `safe`
 * @property {Array<string> | null | undefined} [encode]
 *   Extra characters that *must* be encoded (as character references) instead
 *   of escaped (character escapes).
 *
 *   Only ASCII punctuation will use character escapes, so you never need to
 *   pass non-ASCII-punctuation here.
 *
 * @typedef {SafeFields & SafeEncodeFields} SafeConfig
 *
 * @callback Safe
 *   Make a string safe for embedding in markdown constructs.
 *
 *   In markdown, almost all punctuation characters can, in certain cases,
 *   result in something.
 *   Whether they do is highly subjective to where they happen and in what
 *   they happen.
 *
 *   To solve this, `mdast-util-to-markdown` tracks:
 *
 *   * Characters before and after something;
 *   * What “constructs” we are in.
 *
 *   This information is then used by this function to escape or encode
 *   special characters.
 * @param {string | null | undefined} input
 *   Raw value to make safe.
 * @param {SafeConfig} config
 *   Configuration.
 * @returns {string}
 *   Serialized markdown safe for embedding.
 *
 * @callback Enter
 *   Enter something.
 * @param {ConstructName} name
 *   Label, more similar to a micromark event than an mdast node type.
 * @returns {Exit}
 *   Revert.
 *
 * @callback Exit
 *   Exit something.
 * @returns {void}
 *   Nothing.
 *
 * @typedef State
 *   Info passed around about the current state.
 * @property {Array<ConstructName>} stack
 *   Stack of constructs we’re in.
 * @property {Array<number>} indexStack
 *   Positions of child nodes in their parents.
 * @property {IndentLines} indentLines
 *   Pad serialized markdown.
 * @property {AssociationId} associationId
 *   Get an identifier from an association to match it to others.
 * @property {ContainerPhrasing} containerPhrasing
 *   Serialize the children of a parent that contains phrasing children.
 * @property {ContainerFlow} containerFlow
 *   Serialize the children of a parent that contains flow children.
 * @property {CreateTracker} createTracker
 *   Track positional info in the output.
 * @property {Safe} safe
 *   Serialize the children of a parent that contains flow children.
 * @property {Enter} enter
 *   Enter a construct (returns a corresponding exit function).
 * @property {Options} options
 *   Applied user configuration.
 * @property {Array<Unsafe>} unsafe
 *   Applied unsafe patterns.
 * @property {Array<Join>} join
 *   Applied join handlers.
 * @property {Handle} handle
 *   Call the configured handler for the given node.
 * @property {Handlers} handlers
 *   Applied handlers.
 * @property {string | undefined} bulletCurrent
 *   List marker currently in use.
 * @property {string | undefined} bulletLastUsed
 *   List marker previously in use.
 *
 * @callback Handle
 *   Handle a particular node.
 * @param {any} node
 *   Expected mdast node.
 * @param {Parent | undefined} parent
 *   Parent of `node`.
 * @param {State} state
 *   Info passed around about the current state.
 * @param {Info} Info
 *   Info on the surrounding of the node that is serialized.
 * @returns {string}
 *   Serialized markdown representing `node`.
 *
 * @typedef {Record<Node['type'], Handle>} Handlers
 *   Handle particular nodes.
 *
 *   Each key is a node type, each value its corresponding handler.
 *
 * @callback Join
 *   How to join two blocks.
 *
 *   “Blocks” are typically joined by one blank line.
 *   Sometimes it’s nicer to have them flush next to each other, yet other
 *   times they cannot occur together at all.
 *
 *   Join functions receive two adjacent siblings and their parent and what
 *   they return defines how many blank lines to use between them.
 * @param {Node} left
 *   First of two adjacent siblings.
 * @param {Node} right
 *   Second of two adjacent siblings.
 * @param {Parent} parent
 *   Parent of the two siblings.
 * @param {State} state
 *   Info passed around about the current state.
 * @returns {boolean | null | undefined | void | number}
 *   How many blank lines to use between the siblings.
 *
 *   Where `true` is as passing `1` and `false` means the nodes cannot be
 *   joined by a blank line, such as two adjacent block quotes or indented code
 *   after a list, in which case a comment will be injected to break them up:
 *
 *   ```markdown
 *   > Quote 1
 *
 *   <!---->
 *
 *   > Quote 2
 *   ```
 *
 *    > 👉 **Note**: abusing this feature will break markdown.
 *    > One such example is when returning `0` for two paragraphs, which will
 *    > result in the text running together, and in the future to be seen as
 *    > one paragraph.
 *
 * @typedef Unsafe
 *   Schema that defines when a character cannot occur.
 * @property {string} character
 *   Single unsafe character.
 * @property {ConstructName | Array<ConstructName> | null | undefined} [inConstruct]
 *   Constructs where this is bad.
 * @property {ConstructName | Array<ConstructName> | null | undefined} [notInConstruct]
 *   Constructs where this is fine again.
 * @property {string | null | undefined} [before]
 *   `character` is bad when this is before it (cannot be used together with
 *   `atBreak`).
 * @property {string | null | undefined} [after]
 *   `character` is bad when this is after it.
 * @property {boolean | null | undefined} [atBreak]
 *   `character` is bad at a break (cannot be used together with `before`).
 * @property {RegExp | null | undefined} [_compiled]
 *   The unsafe pattern (this whole object) compiled as a regex.
 *
 *   This is internal and must not be defined.
 *
 * @typedef Options
 *   Configuration (optional).
 * @property {'-' | '*' | '+' | null | undefined} [bullet='*']
 *   Marker to use for bullets of items in unordered lists.
 * @property {'-' | '*' | '+' | null | undefined} [bulletOther]
 *   Marker to use in certain cases where the primary bullet doesn’t work.
 *
 *   There are three cases where the primary bullet cannot be used:
 *
 *   *   When three list items are on their own, the last one is empty, and
 *       `bullet` is also a valid `rule`: `* - +`.
 *       This would turn into a thematic break if serialized with three primary
 *       bullets.
 *       As this is an edge case unlikely to appear in normal markdown, the
 *       last list item will be given a different bullet.
 *   *   When a thematic break is the first child of one of the list items, and
 *       `bullet` is the same character as `rule`: `- ***`.
 *       This would turn into a single thematic break if serialized with
 *       primary bullets.
 *       As this is an edge case unlikely to appear in normal markdown this
 *       markup is always fixed, even if `bulletOther` is not passed
 *   *   When two unordered lists appear next to each other: `* a\n- b`.
 *       CommonMark sees different bullets as different lists, but several
 *       markdown parsers parse it as one list.
 *       To solve for both, we instead inject an empty comment between the two
 *       lists: `* a\n<!---->\n* b`, but if `bulletOther` is given explicitly,
 *       it will be used instead
 * @property {'.' | ')' | null | undefined} [bulletOrdered='.']
 *   Marker to use for bullets of items in ordered lists.
 * @property {'.' | ')' | null | undefined} [bulletOrderedOther]
 *   Marker to use in certain cases where the primary bullet for ordered items
 *   doesn’t work.
 *
 *   There is one case where the primary bullet for ordered items cannot be used:
 *
 *   *   When two ordered lists appear next to each other: `1. a\n2) b`.
 *       CommonMark added support for `)` as a marker, but other markdown
 *       parsers do not support it.
 *       To solve for both, we instead inject an empty comment between the two
 *       lists: `1. a\n<!---->\n1. b`, but if `bulletOrderedOther` is given
 *       explicitly, it will be used instead
 * @property {boolean | null | undefined} [closeAtx=false]
 *   Whether to add the same number of number signs (`#`) at the end of an ATX
 *   heading as the opening sequence.
 * @property {'_' | '*' | null | undefined} [emphasis='*']
 *   Marker to use for emphasis.
 * @property {'~' | '`' | null | undefined} [fence='`']
 *   Marker to use for fenced code.
 * @property {boolean | null | undefined} [fences=false]
 *   Whether to use fenced code always.
 *
 *   The default is to use fenced code if there is a language defined, if the
 *   code is empty, or if it starts or ends in blank lines.
 * @property {boolean | null | undefined} [incrementListMarker=true]
 *   Whether to increment the counter of ordered lists items.
 * @property {'tab' | 'one' | 'mixed' | null | undefined} [listItemIndent='tab']
 *   How to indent the content of list items.
 *
 *   Either with the size of the bullet plus one space (when `'one'`), a tab
 *   stop (`'tab'`), or depending on the item and its parent list (`'mixed'`,
 *   uses `'one'` if the item and list are tight and `'tab'` otherwise).
 * @property {'"' | "'" | null | undefined} [quote='"']
 *   Marker to use for titles.
 * @property {boolean | null | undefined} [resourceLink=false]
 *   Whether to always use resource links.
 *
 *   The default is to use autolinks (`<https://example.com>`) when possible
 *   and resource links (`[text](url)`) otherwise.
 * @property {'-' | '_' | '*' | null | undefined} [rule='*']
 *   Marker to use for thematic breaks.
 * @property {number | null | undefined} [ruleRepetition=3]
 *   Number of markers to use for thematic breaks.
 * @property {boolean | null | undefined} [ruleSpaces=false]
 *   Whether to add spaces between markers in thematic breaks.
 * @property {boolean | null | undefined} [setext=false]
 *   Whether to use setext headings when possible.
 *
 *   The default is to always use ATX headings (`# heading`) instead of setext
 *   headings (`heading\n=======`).
 *   Setext headings cannot be used for empty headings or headings with a rank
 *   of three or more.
 * @property {'_' | '*' | null | undefined} [strong='*']
 *   Marker to use for strong.
 * @property {boolean | null | undefined} [tightDefinitions=false]
 *   Whether to join definitions without a blank line.
 *
 *   The default is to add blank lines between any flow (“block”) construct.
 *   Turning this option on is a shortcut for a join function like so:
 *
 *   ```js
 *   function joinTightDefinitions(left, right) {
 *     if (left.type === 'definition' && right.type === 'definition') {
 *       return 0
 *     }
 *   }
 *   ```
 * @property {Partial<Handlers> | null | undefined} [handlers={}]
 *   Handle particular nodes.
 *
 *   Each key is a node type, each value its corresponding handler.
 * @property {Array<Join> | null | undefined} [join=[]]
 *   How to join blocks.
 * @property {Array<Unsafe> | null | undefined} [unsafe=[]]
 *   Schemas that define when characters cannot occur.
 * @property {Array<Options> | null | undefined} [extensions=[]]
 *   List of extensions to include.
 *
 *   Each `ToMarkdownExtension` is an object with the same interface as
 *   `Options` here.
 */

export {}
