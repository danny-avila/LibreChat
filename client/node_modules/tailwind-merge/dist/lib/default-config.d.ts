import { isAny, isArbitraryLength, isArbitraryNumber, isArbitraryPosition, isArbitraryShadow, isArbitrarySize, isArbitraryUrl, isArbitraryValue, isInteger, isLength, isNumber, isPercent, isTshirtSize } from './validators';
export declare function getDefaultConfig(): {
    readonly cacheSize: 500;
    readonly theme: {
        readonly colors: readonly [typeof isAny];
        readonly spacing: readonly [typeof isLength];
        readonly blur: readonly ["none", "", typeof isTshirtSize, typeof isArbitraryValue];
        readonly brightness: (typeof isNumber)[];
        readonly borderColor: readonly [import("./types").ThemeGetter];
        readonly borderRadius: readonly ["none", "", "full", typeof isTshirtSize, typeof isArbitraryValue];
        readonly borderSpacing: readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        readonly borderWidth: readonly ["", typeof isLength];
        readonly contrast: (typeof isNumber)[];
        readonly grayscale: readonly ["", "0", typeof isArbitraryValue];
        readonly hueRotate: (typeof isArbitraryValue)[];
        readonly invert: readonly ["", "0", typeof isArbitraryValue];
        readonly gap: readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        readonly gradientColorStops: readonly [import("./types").ThemeGetter];
        readonly gradientColorStopPositions: readonly [typeof isPercent, typeof isArbitraryLength];
        readonly inset: readonly ["auto", typeof isArbitraryValue, import("./types").ThemeGetter];
        readonly margin: readonly ["auto", typeof isArbitraryValue, import("./types").ThemeGetter];
        readonly opacity: (typeof isNumber)[];
        readonly padding: readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        readonly saturate: (typeof isNumber)[];
        readonly scale: (typeof isNumber)[];
        readonly sepia: readonly ["", "0", typeof isArbitraryValue];
        readonly skew: (typeof isArbitraryValue)[];
        readonly space: readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        readonly translate: readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
    };
    readonly classGroups: {
        /**
         * Aspect Ratio
         * @see https://tailwindcss.com/docs/aspect-ratio
         */
        readonly aspect: readonly [{
            readonly aspect: readonly ["auto", "square", "video", typeof isArbitraryValue];
        }];
        /**
         * Container
         * @see https://tailwindcss.com/docs/container
         */
        readonly container: readonly ["container"];
        /**
         * Columns
         * @see https://tailwindcss.com/docs/columns
         */
        readonly columns: readonly [{
            readonly columns: readonly [typeof isTshirtSize];
        }];
        /**
         * Break After
         * @see https://tailwindcss.com/docs/break-after
         */
        readonly 'break-after': readonly [{
            readonly 'break-after': readonly ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
        }];
        /**
         * Break Before
         * @see https://tailwindcss.com/docs/break-before
         */
        readonly 'break-before': readonly [{
            readonly 'break-before': readonly ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
        }];
        /**
         * Break Inside
         * @see https://tailwindcss.com/docs/break-inside
         */
        readonly 'break-inside': readonly [{
            readonly 'break-inside': readonly ["auto", "avoid", "avoid-page", "avoid-column"];
        }];
        /**
         * Box Decoration Break
         * @see https://tailwindcss.com/docs/box-decoration-break
         */
        readonly 'box-decoration': readonly [{
            readonly 'box-decoration': readonly ["slice", "clone"];
        }];
        /**
         * Box Sizing
         * @see https://tailwindcss.com/docs/box-sizing
         */
        readonly box: readonly [{
            readonly box: readonly ["border", "content"];
        }];
        /**
         * Display
         * @see https://tailwindcss.com/docs/display
         */
        readonly display: readonly ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"];
        /**
         * Floats
         * @see https://tailwindcss.com/docs/float
         */
        readonly float: readonly [{
            readonly float: readonly ["right", "left", "none"];
        }];
        /**
         * Clear
         * @see https://tailwindcss.com/docs/clear
         */
        readonly clear: readonly [{
            readonly clear: readonly ["left", "right", "both", "none"];
        }];
        /**
         * Isolation
         * @see https://tailwindcss.com/docs/isolation
         */
        readonly isolation: readonly ["isolate", "isolation-auto"];
        /**
         * Object Fit
         * @see https://tailwindcss.com/docs/object-fit
         */
        readonly 'object-fit': readonly [{
            readonly object: readonly ["contain", "cover", "fill", "none", "scale-down"];
        }];
        /**
         * Object Position
         * @see https://tailwindcss.com/docs/object-position
         */
        readonly 'object-position': readonly [{
            readonly object: readonly ["bottom", "center", "left", "left-bottom", "left-top", "right", "right-bottom", "right-top", "top", typeof isArbitraryValue];
        }];
        /**
         * Overflow
         * @see https://tailwindcss.com/docs/overflow
         */
        readonly overflow: readonly [{
            readonly overflow: readonly ["auto", "hidden", "clip", "visible", "scroll"];
        }];
        /**
         * Overflow X
         * @see https://tailwindcss.com/docs/overflow
         */
        readonly 'overflow-x': readonly [{
            readonly 'overflow-x': readonly ["auto", "hidden", "clip", "visible", "scroll"];
        }];
        /**
         * Overflow Y
         * @see https://tailwindcss.com/docs/overflow
         */
        readonly 'overflow-y': readonly [{
            readonly 'overflow-y': readonly ["auto", "hidden", "clip", "visible", "scroll"];
        }];
        /**
         * Overscroll Behavior
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        readonly overscroll: readonly [{
            readonly overscroll: readonly ["auto", "contain", "none"];
        }];
        /**
         * Overscroll Behavior X
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        readonly 'overscroll-x': readonly [{
            readonly 'overscroll-x': readonly ["auto", "contain", "none"];
        }];
        /**
         * Overscroll Behavior Y
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        readonly 'overscroll-y': readonly [{
            readonly 'overscroll-y': readonly ["auto", "contain", "none"];
        }];
        /**
         * Position
         * @see https://tailwindcss.com/docs/position
         */
        readonly position: readonly ["static", "fixed", "absolute", "relative", "sticky"];
        /**
         * Top / Right / Bottom / Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        readonly inset: readonly [{
            readonly inset: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Right / Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        readonly 'inset-x': readonly [{
            readonly 'inset-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Top / Bottom
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        readonly 'inset-y': readonly [{
            readonly 'inset-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        readonly start: readonly [{
            readonly start: readonly [import("./types").ThemeGetter];
        }];
        /**
         * End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        readonly end: readonly [{
            readonly end: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Top
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        readonly top: readonly [{
            readonly top: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Right
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        readonly right: readonly [{
            readonly right: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Bottom
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        readonly bottom: readonly [{
            readonly bottom: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        readonly left: readonly [{
            readonly left: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Visibility
         * @see https://tailwindcss.com/docs/visibility
         */
        readonly visibility: readonly ["visible", "invisible", "collapse"];
        /**
         * Z-Index
         * @see https://tailwindcss.com/docs/z-index
         */
        readonly z: readonly [{
            readonly z: readonly ["auto", typeof isInteger];
        }];
        /**
         * Flex Basis
         * @see https://tailwindcss.com/docs/flex-basis
         */
        readonly basis: readonly [{
            readonly basis: readonly ["auto", typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Flex Direction
         * @see https://tailwindcss.com/docs/flex-direction
         */
        readonly 'flex-direction': readonly [{
            readonly flex: readonly ["row", "row-reverse", "col", "col-reverse"];
        }];
        /**
         * Flex Wrap
         * @see https://tailwindcss.com/docs/flex-wrap
         */
        readonly 'flex-wrap': readonly [{
            readonly flex: readonly ["wrap", "wrap-reverse", "nowrap"];
        }];
        /**
         * Flex
         * @see https://tailwindcss.com/docs/flex
         */
        readonly flex: readonly [{
            readonly flex: readonly ["1", "auto", "initial", "none", typeof isArbitraryValue];
        }];
        /**
         * Flex Grow
         * @see https://tailwindcss.com/docs/flex-grow
         */
        readonly grow: readonly [{
            readonly grow: readonly ["", "0", typeof isArbitraryValue];
        }];
        /**
         * Flex Shrink
         * @see https://tailwindcss.com/docs/flex-shrink
         */
        readonly shrink: readonly [{
            readonly shrink: readonly ["", "0", typeof isArbitraryValue];
        }];
        /**
         * Order
         * @see https://tailwindcss.com/docs/order
         */
        readonly order: readonly [{
            readonly order: readonly ["first", "last", "none", typeof isInteger];
        }];
        /**
         * Grid Template Columns
         * @see https://tailwindcss.com/docs/grid-template-columns
         */
        readonly 'grid-cols': readonly [{
            readonly 'grid-cols': readonly [typeof isAny];
        }];
        /**
         * Grid Column Start / End
         * @see https://tailwindcss.com/docs/grid-column
         */
        readonly 'col-start-end': readonly [{
            readonly col: readonly ["auto", {
                readonly span: readonly ["full", typeof isInteger];
            }, typeof isArbitraryValue];
        }];
        /**
         * Grid Column Start
         * @see https://tailwindcss.com/docs/grid-column
         */
        readonly 'col-start': readonly [{
            readonly 'col-start': readonly ["auto", typeof isNumber, typeof isArbitraryValue];
        }];
        /**
         * Grid Column End
         * @see https://tailwindcss.com/docs/grid-column
         */
        readonly 'col-end': readonly [{
            readonly 'col-end': readonly ["auto", typeof isNumber, typeof isArbitraryValue];
        }];
        /**
         * Grid Template Rows
         * @see https://tailwindcss.com/docs/grid-template-rows
         */
        readonly 'grid-rows': readonly [{
            readonly 'grid-rows': readonly [typeof isAny];
        }];
        /**
         * Grid Row Start / End
         * @see https://tailwindcss.com/docs/grid-row
         */
        readonly 'row-start-end': readonly [{
            readonly row: readonly ["auto", {
                readonly span: readonly [typeof isInteger];
            }, typeof isArbitraryValue];
        }];
        /**
         * Grid Row Start
         * @see https://tailwindcss.com/docs/grid-row
         */
        readonly 'row-start': readonly [{
            readonly 'row-start': readonly ["auto", typeof isNumber, typeof isArbitraryValue];
        }];
        /**
         * Grid Row End
         * @see https://tailwindcss.com/docs/grid-row
         */
        readonly 'row-end': readonly [{
            readonly 'row-end': readonly ["auto", typeof isNumber, typeof isArbitraryValue];
        }];
        /**
         * Grid Auto Flow
         * @see https://tailwindcss.com/docs/grid-auto-flow
         */
        readonly 'grid-flow': readonly [{
            readonly 'grid-flow': readonly ["row", "col", "dense", "row-dense", "col-dense"];
        }];
        /**
         * Grid Auto Columns
         * @see https://tailwindcss.com/docs/grid-auto-columns
         */
        readonly 'auto-cols': readonly [{
            readonly 'auto-cols': readonly ["auto", "min", "max", "fr", typeof isArbitraryValue];
        }];
        /**
         * Grid Auto Rows
         * @see https://tailwindcss.com/docs/grid-auto-rows
         */
        readonly 'auto-rows': readonly [{
            readonly 'auto-rows': readonly ["auto", "min", "max", "fr", typeof isArbitraryValue];
        }];
        /**
         * Gap
         * @see https://tailwindcss.com/docs/gap
         */
        readonly gap: readonly [{
            readonly gap: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Gap X
         * @see https://tailwindcss.com/docs/gap
         */
        readonly 'gap-x': readonly [{
            readonly 'gap-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Gap Y
         * @see https://tailwindcss.com/docs/gap
         */
        readonly 'gap-y': readonly [{
            readonly 'gap-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Justify Content
         * @see https://tailwindcss.com/docs/justify-content
         */
        readonly 'justify-content': readonly [{
            readonly justify: readonly ["normal", "start", "end", "center", "between", "around", "evenly", "stretch"];
        }];
        /**
         * Justify Items
         * @see https://tailwindcss.com/docs/justify-items
         */
        readonly 'justify-items': readonly [{
            readonly 'justify-items': readonly ["start", "end", "center", "stretch"];
        }];
        /**
         * Justify Self
         * @see https://tailwindcss.com/docs/justify-self
         */
        readonly 'justify-self': readonly [{
            readonly 'justify-self': readonly ["auto", "start", "end", "center", "stretch"];
        }];
        /**
         * Align Content
         * @see https://tailwindcss.com/docs/align-content
         */
        readonly 'align-content': readonly [{
            readonly content: readonly ["normal", "start", "end", "center", "between", "around", "evenly", "stretch", "baseline"];
        }];
        /**
         * Align Items
         * @see https://tailwindcss.com/docs/align-items
         */
        readonly 'align-items': readonly [{
            readonly items: readonly ["start", "end", "center", "baseline", "stretch"];
        }];
        /**
         * Align Self
         * @see https://tailwindcss.com/docs/align-self
         */
        readonly 'align-self': readonly [{
            readonly self: readonly ["auto", "start", "end", "center", "stretch", "baseline"];
        }];
        /**
         * Place Content
         * @see https://tailwindcss.com/docs/place-content
         */
        readonly 'place-content': readonly [{
            readonly 'place-content': readonly ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline"];
        }];
        /**
         * Place Items
         * @see https://tailwindcss.com/docs/place-items
         */
        readonly 'place-items': readonly [{
            readonly 'place-items': readonly ["start", "end", "center", "baseline", "stretch"];
        }];
        /**
         * Place Self
         * @see https://tailwindcss.com/docs/place-self
         */
        readonly 'place-self': readonly [{
            readonly 'place-self': readonly ["auto", "start", "end", "center", "stretch"];
        }];
        /**
         * Padding
         * @see https://tailwindcss.com/docs/padding
         */
        readonly p: readonly [{
            readonly p: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Padding X
         * @see https://tailwindcss.com/docs/padding
         */
        readonly px: readonly [{
            readonly px: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Padding Y
         * @see https://tailwindcss.com/docs/padding
         */
        readonly py: readonly [{
            readonly py: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Padding Start
         * @see https://tailwindcss.com/docs/padding
         */
        readonly ps: readonly [{
            readonly ps: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Padding End
         * @see https://tailwindcss.com/docs/padding
         */
        readonly pe: readonly [{
            readonly pe: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Padding Top
         * @see https://tailwindcss.com/docs/padding
         */
        readonly pt: readonly [{
            readonly pt: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Padding Right
         * @see https://tailwindcss.com/docs/padding
         */
        readonly pr: readonly [{
            readonly pr: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Padding Bottom
         * @see https://tailwindcss.com/docs/padding
         */
        readonly pb: readonly [{
            readonly pb: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Padding Left
         * @see https://tailwindcss.com/docs/padding
         */
        readonly pl: readonly [{
            readonly pl: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Margin
         * @see https://tailwindcss.com/docs/margin
         */
        readonly m: readonly [{
            readonly m: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Margin X
         * @see https://tailwindcss.com/docs/margin
         */
        readonly mx: readonly [{
            readonly mx: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Margin Y
         * @see https://tailwindcss.com/docs/margin
         */
        readonly my: readonly [{
            readonly my: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Margin Start
         * @see https://tailwindcss.com/docs/margin
         */
        readonly ms: readonly [{
            readonly ms: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Margin End
         * @see https://tailwindcss.com/docs/margin
         */
        readonly me: readonly [{
            readonly me: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Margin Top
         * @see https://tailwindcss.com/docs/margin
         */
        readonly mt: readonly [{
            readonly mt: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Margin Right
         * @see https://tailwindcss.com/docs/margin
         */
        readonly mr: readonly [{
            readonly mr: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Margin Bottom
         * @see https://tailwindcss.com/docs/margin
         */
        readonly mb: readonly [{
            readonly mb: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Margin Left
         * @see https://tailwindcss.com/docs/margin
         */
        readonly ml: readonly [{
            readonly ml: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Space Between X
         * @see https://tailwindcss.com/docs/space
         */
        readonly 'space-x': readonly [{
            readonly 'space-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Space Between X Reverse
         * @see https://tailwindcss.com/docs/space
         */
        readonly 'space-x-reverse': readonly ["space-x-reverse"];
        /**
         * Space Between Y
         * @see https://tailwindcss.com/docs/space
         */
        readonly 'space-y': readonly [{
            readonly 'space-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Space Between Y Reverse
         * @see https://tailwindcss.com/docs/space
         */
        readonly 'space-y-reverse': readonly ["space-y-reverse"];
        /**
         * Width
         * @see https://tailwindcss.com/docs/width
         */
        readonly w: readonly [{
            readonly w: readonly ["auto", "min", "max", "fit", typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Min-Width
         * @see https://tailwindcss.com/docs/min-width
         */
        readonly 'min-w': readonly [{
            readonly 'min-w': readonly ["min", "max", "fit", typeof isArbitraryValue, typeof isLength];
        }];
        /**
         * Max-Width
         * @see https://tailwindcss.com/docs/max-width
         */
        readonly 'max-w': readonly [{
            readonly 'max-w': readonly ["0", "none", "full", "min", "max", "fit", "prose", {
                readonly screen: readonly [typeof isTshirtSize];
            }, typeof isTshirtSize, typeof isArbitraryValue];
        }];
        /**
         * Height
         * @see https://tailwindcss.com/docs/height
         */
        readonly h: readonly [{
            readonly h: readonly [typeof isArbitraryValue, import("./types").ThemeGetter, "auto", "min", "max", "fit"];
        }];
        /**
         * Min-Height
         * @see https://tailwindcss.com/docs/min-height
         */
        readonly 'min-h': readonly [{
            readonly 'min-h': readonly ["min", "max", "fit", typeof isArbitraryValue, typeof isLength];
        }];
        /**
         * Max-Height
         * @see https://tailwindcss.com/docs/max-height
         */
        readonly 'max-h': readonly [{
            readonly 'max-h': readonly [typeof isArbitraryValue, import("./types").ThemeGetter, "min", "max", "fit"];
        }];
        /**
         * Font Size
         * @see https://tailwindcss.com/docs/font-size
         */
        readonly 'font-size': readonly [{
            readonly text: readonly ["base", typeof isTshirtSize, typeof isArbitraryLength];
        }];
        /**
         * Font Smoothing
         * @see https://tailwindcss.com/docs/font-smoothing
         */
        readonly 'font-smoothing': readonly ["antialiased", "subpixel-antialiased"];
        /**
         * Font Style
         * @see https://tailwindcss.com/docs/font-style
         */
        readonly 'font-style': readonly ["italic", "not-italic"];
        /**
         * Font Weight
         * @see https://tailwindcss.com/docs/font-weight
         */
        readonly 'font-weight': readonly [{
            readonly font: readonly ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black", typeof isArbitraryNumber];
        }];
        /**
         * Font Family
         * @see https://tailwindcss.com/docs/font-family
         */
        readonly 'font-family': readonly [{
            readonly font: readonly [typeof isAny];
        }];
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        readonly 'fvn-normal': readonly ["normal-nums"];
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        readonly 'fvn-ordinal': readonly ["ordinal"];
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        readonly 'fvn-slashed-zero': readonly ["slashed-zero"];
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        readonly 'fvn-figure': readonly ["lining-nums", "oldstyle-nums"];
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        readonly 'fvn-spacing': readonly ["proportional-nums", "tabular-nums"];
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        readonly 'fvn-fraction': readonly ["diagonal-fractions", "stacked-fractons"];
        /**
         * Letter Spacing
         * @see https://tailwindcss.com/docs/letter-spacing
         */
        readonly tracking: readonly [{
            readonly tracking: readonly ["tighter", "tight", "normal", "wide", "wider", "widest", typeof isArbitraryValue];
        }];
        /**
         * Line Clamp
         * @see https://tailwindcss.com/docs/line-clamp
         */
        readonly 'line-clamp': readonly [{
            readonly 'line-clamp': readonly ["none", typeof isNumber, typeof isArbitraryNumber];
        }];
        /**
         * Line Height
         * @see https://tailwindcss.com/docs/line-height
         */
        readonly leading: readonly [{
            readonly leading: readonly ["none", "tight", "snug", "normal", "relaxed", "loose", typeof isArbitraryValue, typeof isLength];
        }];
        /**
         * List Style Image
         * @see https://tailwindcss.com/docs/list-style-image
         */
        readonly 'list-image': readonly [{
            readonly 'list-image': readonly ["none", typeof isArbitraryValue];
        }];
        /**
         * List Style Type
         * @see https://tailwindcss.com/docs/list-style-type
         */
        readonly 'list-style-type': readonly [{
            readonly list: readonly ["none", "disc", "decimal", typeof isArbitraryValue];
        }];
        /**
         * List Style Position
         * @see https://tailwindcss.com/docs/list-style-position
         */
        readonly 'list-style-position': readonly [{
            readonly list: readonly ["inside", "outside"];
        }];
        /**
         * Placeholder Color
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://tailwindcss.com/docs/placeholder-color
         */
        readonly 'placeholder-color': readonly [{
            readonly placeholder: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Placeholder Opacity
         * @see https://tailwindcss.com/docs/placeholder-opacity
         */
        readonly 'placeholder-opacity': readonly [{
            readonly 'placeholder-opacity': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Text Alignment
         * @see https://tailwindcss.com/docs/text-align
         */
        readonly 'text-alignment': readonly [{
            readonly text: readonly ["left", "center", "right", "justify", "start", "end"];
        }];
        /**
         * Text Color
         * @see https://tailwindcss.com/docs/text-color
         */
        readonly 'text-color': readonly [{
            readonly text: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Text Opacity
         * @see https://tailwindcss.com/docs/text-opacity
         */
        readonly 'text-opacity': readonly [{
            readonly 'text-opacity': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Text Decoration
         * @see https://tailwindcss.com/docs/text-decoration
         */
        readonly 'text-decoration': readonly ["underline", "overline", "line-through", "no-underline"];
        /**
         * Text Decoration Style
         * @see https://tailwindcss.com/docs/text-decoration-style
         */
        readonly 'text-decoration-style': readonly [{
            readonly decoration: readonly ["solid", "dashed", "dotted", "double", "none", "wavy"];
        }];
        /**
         * Text Decoration Thickness
         * @see https://tailwindcss.com/docs/text-decoration-thickness
         */
        readonly 'text-decoration-thickness': readonly [{
            readonly decoration: readonly ["auto", "from-font", typeof isLength];
        }];
        /**
         * Text Underline Offset
         * @see https://tailwindcss.com/docs/text-underline-offset
         */
        readonly 'underline-offset': readonly [{
            readonly 'underline-offset': readonly ["auto", typeof isArbitraryValue, typeof isLength];
        }];
        /**
         * Text Decoration Color
         * @see https://tailwindcss.com/docs/text-decoration-color
         */
        readonly 'text-decoration-color': readonly [{
            readonly decoration: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Text Transform
         * @see https://tailwindcss.com/docs/text-transform
         */
        readonly 'text-transform': readonly ["uppercase", "lowercase", "capitalize", "normal-case"];
        /**
         * Text Overflow
         * @see https://tailwindcss.com/docs/text-overflow
         */
        readonly 'text-overflow': readonly ["truncate", "text-ellipsis", "text-clip"];
        /**
         * Text Indent
         * @see https://tailwindcss.com/docs/text-indent
         */
        readonly indent: readonly [{
            readonly indent: readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Vertical Alignment
         * @see https://tailwindcss.com/docs/vertical-align
         */
        readonly 'vertical-align': readonly [{
            readonly align: readonly ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", typeof isArbitraryValue];
        }];
        /**
         * Whitespace
         * @see https://tailwindcss.com/docs/whitespace
         */
        readonly whitespace: readonly [{
            readonly whitespace: readonly ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"];
        }];
        /**
         * Word Break
         * @see https://tailwindcss.com/docs/word-break
         */
        readonly break: readonly [{
            readonly break: readonly ["normal", "words", "all", "keep"];
        }];
        /**
         * Hyphens
         * @see https://tailwindcss.com/docs/hyphens
         */
        readonly hyphens: readonly [{
            readonly hyphens: readonly ["none", "manual", "auto"];
        }];
        /**
         * Content
         * @see https://tailwindcss.com/docs/content
         */
        readonly content: readonly [{
            readonly content: readonly ["none", typeof isArbitraryValue];
        }];
        /**
         * Background Attachment
         * @see https://tailwindcss.com/docs/background-attachment
         */
        readonly 'bg-attachment': readonly [{
            readonly bg: readonly ["fixed", "local", "scroll"];
        }];
        /**
         * Background Clip
         * @see https://tailwindcss.com/docs/background-clip
         */
        readonly 'bg-clip': readonly [{
            readonly 'bg-clip': readonly ["border", "padding", "content", "text"];
        }];
        /**
         * Background Opacity
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://tailwindcss.com/docs/background-opacity
         */
        readonly 'bg-opacity': readonly [{
            readonly 'bg-opacity': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Background Origin
         * @see https://tailwindcss.com/docs/background-origin
         */
        readonly 'bg-origin': readonly [{
            readonly 'bg-origin': readonly ["border", "padding", "content"];
        }];
        /**
         * Background Position
         * @see https://tailwindcss.com/docs/background-position
         */
        readonly 'bg-position': readonly [{
            readonly bg: readonly ["bottom", "center", "left", "left-bottom", "left-top", "right", "right-bottom", "right-top", "top", typeof isArbitraryPosition];
        }];
        /**
         * Background Repeat
         * @see https://tailwindcss.com/docs/background-repeat
         */
        readonly 'bg-repeat': readonly [{
            readonly bg: readonly ["no-repeat", {
                readonly repeat: readonly ["", "x", "y", "round", "space"];
            }];
        }];
        /**
         * Background Size
         * @see https://tailwindcss.com/docs/background-size
         */
        readonly 'bg-size': readonly [{
            readonly bg: readonly ["auto", "cover", "contain", typeof isArbitrarySize];
        }];
        /**
         * Background Image
         * @see https://tailwindcss.com/docs/background-image
         */
        readonly 'bg-image': readonly [{
            readonly bg: readonly ["none", {
                readonly 'gradient-to': readonly ["t", "tr", "r", "br", "b", "bl", "l", "tl"];
            }, typeof isArbitraryUrl];
        }];
        /**
         * Background Color
         * @see https://tailwindcss.com/docs/background-color
         */
        readonly 'bg-color': readonly [{
            readonly bg: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Gradient Color Stops From Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        readonly 'gradient-from-pos': readonly [{
            readonly from: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Gradient Color Stops Via Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        readonly 'gradient-via-pos': readonly [{
            readonly via: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Gradient Color Stops To Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        readonly 'gradient-to-pos': readonly [{
            readonly to: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Gradient Color Stops From
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        readonly 'gradient-from': readonly [{
            readonly from: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Gradient Color Stops Via
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        readonly 'gradient-via': readonly [{
            readonly via: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Gradient Color Stops To
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        readonly 'gradient-to': readonly [{
            readonly to: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly rounded: readonly [{
            readonly rounded: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-s': readonly [{
            readonly 'rounded-s': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius End
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-e': readonly [{
            readonly 'rounded-e': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Top
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-t': readonly [{
            readonly 'rounded-t': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-r': readonly [{
            readonly 'rounded-r': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Bottom
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-b': readonly [{
            readonly 'rounded-b': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-l': readonly [{
            readonly 'rounded-l': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Start Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-ss': readonly [{
            readonly 'rounded-ss': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Start End
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-se': readonly [{
            readonly 'rounded-se': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius End End
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-ee': readonly [{
            readonly 'rounded-ee': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius End Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-es': readonly [{
            readonly 'rounded-es': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Top Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-tl': readonly [{
            readonly 'rounded-tl': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Top Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-tr': readonly [{
            readonly 'rounded-tr': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Bottom Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-br': readonly [{
            readonly 'rounded-br': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Radius Bottom Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        readonly 'rounded-bl': readonly [{
            readonly 'rounded-bl': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Width
         * @see https://tailwindcss.com/docs/border-width
         */
        readonly 'border-w': readonly [{
            readonly border: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Width X
         * @see https://tailwindcss.com/docs/border-width
         */
        readonly 'border-w-x': readonly [{
            readonly 'border-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Width Y
         * @see https://tailwindcss.com/docs/border-width
         */
        readonly 'border-w-y': readonly [{
            readonly 'border-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Width Start
         * @see https://tailwindcss.com/docs/border-width
         */
        readonly 'border-w-s': readonly [{
            readonly 'border-s': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Width End
         * @see https://tailwindcss.com/docs/border-width
         */
        readonly 'border-w-e': readonly [{
            readonly 'border-e': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Width Top
         * @see https://tailwindcss.com/docs/border-width
         */
        readonly 'border-w-t': readonly [{
            readonly 'border-t': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Width Right
         * @see https://tailwindcss.com/docs/border-width
         */
        readonly 'border-w-r': readonly [{
            readonly 'border-r': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Width Bottom
         * @see https://tailwindcss.com/docs/border-width
         */
        readonly 'border-w-b': readonly [{
            readonly 'border-b': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Width Left
         * @see https://tailwindcss.com/docs/border-width
         */
        readonly 'border-w-l': readonly [{
            readonly 'border-l': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Opacity
         * @see https://tailwindcss.com/docs/border-opacity
         */
        readonly 'border-opacity': readonly [{
            readonly 'border-opacity': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Style
         * @see https://tailwindcss.com/docs/border-style
         */
        readonly 'border-style': readonly [{
            readonly border: readonly ["solid", "dashed", "dotted", "double", "none", "hidden"];
        }];
        /**
         * Divide Width X
         * @see https://tailwindcss.com/docs/divide-width
         */
        readonly 'divide-x': readonly [{
            readonly 'divide-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Divide Width X Reverse
         * @see https://tailwindcss.com/docs/divide-width
         */
        readonly 'divide-x-reverse': readonly ["divide-x-reverse"];
        /**
         * Divide Width Y
         * @see https://tailwindcss.com/docs/divide-width
         */
        readonly 'divide-y': readonly [{
            readonly 'divide-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Divide Width Y Reverse
         * @see https://tailwindcss.com/docs/divide-width
         */
        readonly 'divide-y-reverse': readonly ["divide-y-reverse"];
        /**
         * Divide Opacity
         * @see https://tailwindcss.com/docs/divide-opacity
         */
        readonly 'divide-opacity': readonly [{
            readonly 'divide-opacity': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Divide Style
         * @see https://tailwindcss.com/docs/divide-style
         */
        readonly 'divide-style': readonly [{
            readonly divide: readonly ["solid", "dashed", "dotted", "double", "none"];
        }];
        /**
         * Border Color
         * @see https://tailwindcss.com/docs/border-color
         */
        readonly 'border-color': readonly [{
            readonly border: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Color X
         * @see https://tailwindcss.com/docs/border-color
         */
        readonly 'border-color-x': readonly [{
            readonly 'border-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Color Y
         * @see https://tailwindcss.com/docs/border-color
         */
        readonly 'border-color-y': readonly [{
            readonly 'border-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Color Top
         * @see https://tailwindcss.com/docs/border-color
         */
        readonly 'border-color-t': readonly [{
            readonly 'border-t': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Color Right
         * @see https://tailwindcss.com/docs/border-color
         */
        readonly 'border-color-r': readonly [{
            readonly 'border-r': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Color Bottom
         * @see https://tailwindcss.com/docs/border-color
         */
        readonly 'border-color-b': readonly [{
            readonly 'border-b': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Color Left
         * @see https://tailwindcss.com/docs/border-color
         */
        readonly 'border-color-l': readonly [{
            readonly 'border-l': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Divide Color
         * @see https://tailwindcss.com/docs/divide-color
         */
        readonly 'divide-color': readonly [{
            readonly divide: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Outline Style
         * @see https://tailwindcss.com/docs/outline-style
         */
        readonly 'outline-style': readonly [{
            readonly outline: readonly ["", "solid", "dashed", "dotted", "double", "none"];
        }];
        /**
         * Outline Offset
         * @see https://tailwindcss.com/docs/outline-offset
         */
        readonly 'outline-offset': readonly [{
            readonly 'outline-offset': readonly [typeof isArbitraryValue, typeof isLength];
        }];
        /**
         * Outline Width
         * @see https://tailwindcss.com/docs/outline-width
         */
        readonly 'outline-w': readonly [{
            readonly outline: readonly [typeof isLength];
        }];
        /**
         * Outline Color
         * @see https://tailwindcss.com/docs/outline-color
         */
        readonly 'outline-color': readonly [{
            readonly outline: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Ring Width
         * @see https://tailwindcss.com/docs/ring-width
         */
        readonly 'ring-w': readonly [{
            readonly ring: readonly ["", typeof isLength];
        }];
        /**
         * Ring Width Inset
         * @see https://tailwindcss.com/docs/ring-width
         */
        readonly 'ring-w-inset': readonly ["ring-inset"];
        /**
         * Ring Color
         * @see https://tailwindcss.com/docs/ring-color
         */
        readonly 'ring-color': readonly [{
            readonly ring: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Ring Opacity
         * @see https://tailwindcss.com/docs/ring-opacity
         */
        readonly 'ring-opacity': readonly [{
            readonly 'ring-opacity': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Ring Offset Width
         * @see https://tailwindcss.com/docs/ring-offset-width
         */
        readonly 'ring-offset-w': readonly [{
            readonly 'ring-offset': readonly [typeof isLength];
        }];
        /**
         * Ring Offset Color
         * @see https://tailwindcss.com/docs/ring-offset-color
         */
        readonly 'ring-offset-color': readonly [{
            readonly 'ring-offset': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow
         */
        readonly shadow: readonly [{
            readonly shadow: readonly ["", "inner", "none", typeof isTshirtSize, typeof isArbitraryShadow];
        }];
        /**
         * Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow-color
         */
        readonly 'shadow-color': readonly [{
            readonly shadow: readonly [typeof isAny];
        }];
        /**
         * Opacity
         * @see https://tailwindcss.com/docs/opacity
         */
        readonly opacity: readonly [{
            readonly opacity: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Mix Blend Mode
         * @see https://tailwindcss.com/docs/mix-blend-mode
         */
        readonly 'mix-blend': readonly [{
            readonly 'mix-blend': readonly ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "plus-lighter"];
        }];
        /**
         * Background Blend Mode
         * @see https://tailwindcss.com/docs/background-blend-mode
         */
        readonly 'bg-blend': readonly [{
            readonly 'bg-blend': readonly ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "plus-lighter"];
        }];
        /**
         * Filter
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://tailwindcss.com/docs/filter
         */
        readonly filter: readonly [{
            readonly filter: readonly ["", "none"];
        }];
        /**
         * Blur
         * @see https://tailwindcss.com/docs/blur
         */
        readonly blur: readonly [{
            readonly blur: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Brightness
         * @see https://tailwindcss.com/docs/brightness
         */
        readonly brightness: readonly [{
            readonly brightness: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Contrast
         * @see https://tailwindcss.com/docs/contrast
         */
        readonly contrast: readonly [{
            readonly contrast: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Drop Shadow
         * @see https://tailwindcss.com/docs/drop-shadow
         */
        readonly 'drop-shadow': readonly [{
            readonly 'drop-shadow': readonly ["", "none", typeof isTshirtSize, typeof isArbitraryValue];
        }];
        /**
         * Grayscale
         * @see https://tailwindcss.com/docs/grayscale
         */
        readonly grayscale: readonly [{
            readonly grayscale: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Hue Rotate
         * @see https://tailwindcss.com/docs/hue-rotate
         */
        readonly 'hue-rotate': readonly [{
            readonly 'hue-rotate': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Invert
         * @see https://tailwindcss.com/docs/invert
         */
        readonly invert: readonly [{
            readonly invert: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Saturate
         * @see https://tailwindcss.com/docs/saturate
         */
        readonly saturate: readonly [{
            readonly saturate: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Sepia
         * @see https://tailwindcss.com/docs/sepia
         */
        readonly sepia: readonly [{
            readonly sepia: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Backdrop Filter
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://tailwindcss.com/docs/backdrop-filter
         */
        readonly 'backdrop-filter': readonly [{
            readonly 'backdrop-filter': readonly ["", "none"];
        }];
        /**
         * Backdrop Blur
         * @see https://tailwindcss.com/docs/backdrop-blur
         */
        readonly 'backdrop-blur': readonly [{
            readonly 'backdrop-blur': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Backdrop Brightness
         * @see https://tailwindcss.com/docs/backdrop-brightness
         */
        readonly 'backdrop-brightness': readonly [{
            readonly 'backdrop-brightness': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Backdrop Contrast
         * @see https://tailwindcss.com/docs/backdrop-contrast
         */
        readonly 'backdrop-contrast': readonly [{
            readonly 'backdrop-contrast': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Backdrop Grayscale
         * @see https://tailwindcss.com/docs/backdrop-grayscale
         */
        readonly 'backdrop-grayscale': readonly [{
            readonly 'backdrop-grayscale': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Backdrop Hue Rotate
         * @see https://tailwindcss.com/docs/backdrop-hue-rotate
         */
        readonly 'backdrop-hue-rotate': readonly [{
            readonly 'backdrop-hue-rotate': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Backdrop Invert
         * @see https://tailwindcss.com/docs/backdrop-invert
         */
        readonly 'backdrop-invert': readonly [{
            readonly 'backdrop-invert': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Backdrop Opacity
         * @see https://tailwindcss.com/docs/backdrop-opacity
         */
        readonly 'backdrop-opacity': readonly [{
            readonly 'backdrop-opacity': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Backdrop Saturate
         * @see https://tailwindcss.com/docs/backdrop-saturate
         */
        readonly 'backdrop-saturate': readonly [{
            readonly 'backdrop-saturate': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Backdrop Sepia
         * @see https://tailwindcss.com/docs/backdrop-sepia
         */
        readonly 'backdrop-sepia': readonly [{
            readonly 'backdrop-sepia': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Collapse
         * @see https://tailwindcss.com/docs/border-collapse
         */
        readonly 'border-collapse': readonly [{
            readonly border: readonly ["collapse", "separate"];
        }];
        /**
         * Border Spacing
         * @see https://tailwindcss.com/docs/border-spacing
         */
        readonly 'border-spacing': readonly [{
            readonly 'border-spacing': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Spacing X
         * @see https://tailwindcss.com/docs/border-spacing
         */
        readonly 'border-spacing-x': readonly [{
            readonly 'border-spacing-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Border Spacing Y
         * @see https://tailwindcss.com/docs/border-spacing
         */
        readonly 'border-spacing-y': readonly [{
            readonly 'border-spacing-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Table Layout
         * @see https://tailwindcss.com/docs/table-layout
         */
        readonly 'table-layout': readonly [{
            readonly table: readonly ["auto", "fixed"];
        }];
        /**
         * Caption Side
         * @see https://tailwindcss.com/docs/caption-side
         */
        readonly caption: readonly [{
            readonly caption: readonly ["top", "bottom"];
        }];
        /**
         * Tranisition Property
         * @see https://tailwindcss.com/docs/transition-property
         */
        readonly transition: readonly [{
            readonly transition: readonly ["none", "all", "", "colors", "opacity", "shadow", "transform", typeof isArbitraryValue];
        }];
        /**
         * Transition Duration
         * @see https://tailwindcss.com/docs/transition-duration
         */
        readonly duration: readonly [{
            readonly duration: (typeof isArbitraryValue)[];
        }];
        /**
         * Transition Timing Function
         * @see https://tailwindcss.com/docs/transition-timing-function
         */
        readonly ease: readonly [{
            readonly ease: readonly ["linear", "in", "out", "in-out", typeof isArbitraryValue];
        }];
        /**
         * Transition Delay
         * @see https://tailwindcss.com/docs/transition-delay
         */
        readonly delay: readonly [{
            readonly delay: (typeof isArbitraryValue)[];
        }];
        /**
         * Animation
         * @see https://tailwindcss.com/docs/animation
         */
        readonly animate: readonly [{
            readonly animate: readonly ["none", "spin", "ping", "pulse", "bounce", typeof isArbitraryValue];
        }];
        /**
         * Transform
         * @see https://tailwindcss.com/docs/transform
         */
        readonly transform: readonly [{
            readonly transform: readonly ["", "gpu", "none"];
        }];
        /**
         * Scale
         * @see https://tailwindcss.com/docs/scale
         */
        readonly scale: readonly [{
            readonly scale: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Scale X
         * @see https://tailwindcss.com/docs/scale
         */
        readonly 'scale-x': readonly [{
            readonly 'scale-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Scale Y
         * @see https://tailwindcss.com/docs/scale
         */
        readonly 'scale-y': readonly [{
            readonly 'scale-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Rotate
         * @see https://tailwindcss.com/docs/rotate
         */
        readonly rotate: readonly [{
            readonly rotate: readonly [typeof isInteger, typeof isArbitraryValue];
        }];
        /**
         * Translate X
         * @see https://tailwindcss.com/docs/translate
         */
        readonly 'translate-x': readonly [{
            readonly 'translate-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Translate Y
         * @see https://tailwindcss.com/docs/translate
         */
        readonly 'translate-y': readonly [{
            readonly 'translate-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Skew X
         * @see https://tailwindcss.com/docs/skew
         */
        readonly 'skew-x': readonly [{
            readonly 'skew-x': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Skew Y
         * @see https://tailwindcss.com/docs/skew
         */
        readonly 'skew-y': readonly [{
            readonly 'skew-y': readonly [import("./types").ThemeGetter];
        }];
        /**
         * Transform Origin
         * @see https://tailwindcss.com/docs/transform-origin
         */
        readonly 'transform-origin': readonly [{
            readonly origin: readonly ["center", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left", "top-left", typeof isArbitraryValue];
        }];
        /**
         * Accent Color
         * @see https://tailwindcss.com/docs/accent-color
         */
        readonly accent: readonly [{
            readonly accent: readonly ["auto", import("./types").ThemeGetter];
        }];
        /**
         * Appearance
         * @see https://tailwindcss.com/docs/appearance
         */
        readonly appearance: readonly ["appearance-none"];
        /**
         * Cursor
         * @see https://tailwindcss.com/docs/cursor
         */
        readonly cursor: readonly [{
            readonly cursor: readonly ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", typeof isArbitraryValue];
        }];
        /**
         * Caret Color
         * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
         */
        readonly 'caret-color': readonly [{
            readonly caret: readonly [import("./types").ThemeGetter];
        }];
        /**
         * Pointer Events
         * @see https://tailwindcss.com/docs/pointer-events
         */
        readonly 'pointer-events': readonly [{
            readonly 'pointer-events': readonly ["none", "auto"];
        }];
        /**
         * Resize
         * @see https://tailwindcss.com/docs/resize
         */
        readonly resize: readonly [{
            readonly resize: readonly ["none", "y", "x", ""];
        }];
        /**
         * Scroll Behavior
         * @see https://tailwindcss.com/docs/scroll-behavior
         */
        readonly 'scroll-behavior': readonly [{
            readonly scroll: readonly ["auto", "smooth"];
        }];
        /**
         * Scroll Margin
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        readonly 'scroll-m': readonly [{
            readonly 'scroll-m': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Margin X
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        readonly 'scroll-mx': readonly [{
            readonly 'scroll-mx': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Margin Y
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        readonly 'scroll-my': readonly [{
            readonly 'scroll-my': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Margin Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        readonly 'scroll-ms': readonly [{
            readonly 'scroll-ms': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Margin End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        readonly 'scroll-me': readonly [{
            readonly 'scroll-me': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Margin Top
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        readonly 'scroll-mt': readonly [{
            readonly 'scroll-mt': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Margin Right
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        readonly 'scroll-mr': readonly [{
            readonly 'scroll-mr': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Margin Bottom
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        readonly 'scroll-mb': readonly [{
            readonly 'scroll-mb': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Margin Left
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        readonly 'scroll-ml': readonly [{
            readonly 'scroll-ml': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Padding
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        readonly 'scroll-p': readonly [{
            readonly 'scroll-p': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Padding X
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        readonly 'scroll-px': readonly [{
            readonly 'scroll-px': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Padding Y
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        readonly 'scroll-py': readonly [{
            readonly 'scroll-py': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Padding Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        readonly 'scroll-ps': readonly [{
            readonly 'scroll-ps': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Padding End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        readonly 'scroll-pe': readonly [{
            readonly 'scroll-pe': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Padding Top
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        readonly 'scroll-pt': readonly [{
            readonly 'scroll-pt': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Padding Right
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        readonly 'scroll-pr': readonly [{
            readonly 'scroll-pr': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Padding Bottom
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        readonly 'scroll-pb': readonly [{
            readonly 'scroll-pb': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Padding Left
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        readonly 'scroll-pl': readonly [{
            readonly 'scroll-pl': readonly [typeof isArbitraryValue, import("./types").ThemeGetter];
        }];
        /**
         * Scroll Snap Align
         * @see https://tailwindcss.com/docs/scroll-snap-align
         */
        readonly 'snap-align': readonly [{
            readonly snap: readonly ["start", "end", "center", "align-none"];
        }];
        /**
         * Scroll Snap Stop
         * @see https://tailwindcss.com/docs/scroll-snap-stop
         */
        readonly 'snap-stop': readonly [{
            readonly snap: readonly ["normal", "always"];
        }];
        /**
         * Scroll Snap Type
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        readonly 'snap-type': readonly [{
            readonly snap: readonly ["none", "x", "y", "both"];
        }];
        /**
         * Scroll Snap Type Strictness
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        readonly 'snap-strictness': readonly [{
            readonly snap: readonly ["mandatory", "proximity"];
        }];
        /**
         * Touch Action
         * @see https://tailwindcss.com/docs/touch-action
         */
        readonly touch: readonly [{
            readonly touch: readonly ["auto", "none", "pinch-zoom", "manipulation", {
                readonly pan: readonly ["x", "left", "right", "y", "up", "down"];
            }];
        }];
        /**
         * User Select
         * @see https://tailwindcss.com/docs/user-select
         */
        readonly select: readonly [{
            readonly select: readonly ["none", "text", "all", "auto"];
        }];
        /**
         * Will Change
         * @see https://tailwindcss.com/docs/will-change
         */
        readonly 'will-change': readonly [{
            readonly 'will-change': readonly ["auto", "scroll", "contents", "transform", typeof isArbitraryValue];
        }];
        /**
         * Fill
         * @see https://tailwindcss.com/docs/fill
         */
        readonly fill: readonly [{
            readonly fill: readonly [import("./types").ThemeGetter, "none"];
        }];
        /**
         * Stroke Width
         * @see https://tailwindcss.com/docs/stroke-width
         */
        readonly 'stroke-w': readonly [{
            readonly stroke: readonly [typeof isLength, typeof isArbitraryNumber];
        }];
        /**
         * Stroke
         * @see https://tailwindcss.com/docs/stroke
         */
        readonly stroke: readonly [{
            readonly stroke: readonly [import("./types").ThemeGetter, "none"];
        }];
        /**
         * Screen Readers
         * @see https://tailwindcss.com/docs/screen-readers
         */
        readonly sr: readonly ["sr-only", "not-sr-only"];
    };
    readonly conflictingClassGroups: {
        readonly overflow: readonly ["overflow-x", "overflow-y"];
        readonly overscroll: readonly ["overscroll-x", "overscroll-y"];
        readonly inset: readonly ["inset-x", "inset-y", "start", "end", "top", "right", "bottom", "left"];
        readonly 'inset-x': readonly ["right", "left"];
        readonly 'inset-y': readonly ["top", "bottom"];
        readonly flex: readonly ["basis", "grow", "shrink"];
        readonly gap: readonly ["gap-x", "gap-y"];
        readonly p: readonly ["px", "py", "ps", "pe", "pt", "pr", "pb", "pl"];
        readonly px: readonly ["pr", "pl"];
        readonly py: readonly ["pt", "pb"];
        readonly m: readonly ["mx", "my", "ms", "me", "mt", "mr", "mb", "ml"];
        readonly mx: readonly ["mr", "ml"];
        readonly my: readonly ["mt", "mb"];
        readonly 'font-size': readonly ["leading"];
        readonly 'fvn-normal': readonly ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"];
        readonly 'fvn-ordinal': readonly ["fvn-normal"];
        readonly 'fvn-slashed-zero': readonly ["fvn-normal"];
        readonly 'fvn-figure': readonly ["fvn-normal"];
        readonly 'fvn-spacing': readonly ["fvn-normal"];
        readonly 'fvn-fraction': readonly ["fvn-normal"];
        readonly rounded: readonly ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"];
        readonly 'rounded-s': readonly ["rounded-ss", "rounded-es"];
        readonly 'rounded-e': readonly ["rounded-se", "rounded-ee"];
        readonly 'rounded-t': readonly ["rounded-tl", "rounded-tr"];
        readonly 'rounded-r': readonly ["rounded-tr", "rounded-br"];
        readonly 'rounded-b': readonly ["rounded-br", "rounded-bl"];
        readonly 'rounded-l': readonly ["rounded-tl", "rounded-bl"];
        readonly 'border-spacing': readonly ["border-spacing-x", "border-spacing-y"];
        readonly 'border-w': readonly ["border-w-s", "border-w-e", "border-w-t", "border-w-r", "border-w-b", "border-w-l"];
        readonly 'border-w-x': readonly ["border-w-r", "border-w-l"];
        readonly 'border-w-y': readonly ["border-w-t", "border-w-b"];
        readonly 'border-color': readonly ["border-color-t", "border-color-r", "border-color-b", "border-color-l"];
        readonly 'border-color-x': readonly ["border-color-r", "border-color-l"];
        readonly 'border-color-y': readonly ["border-color-t", "border-color-b"];
        readonly 'scroll-m': readonly ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"];
        readonly 'scroll-mx': readonly ["scroll-mr", "scroll-ml"];
        readonly 'scroll-my': readonly ["scroll-mt", "scroll-mb"];
        readonly 'scroll-p': readonly ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"];
        readonly 'scroll-px': readonly ["scroll-pr", "scroll-pl"];
        readonly 'scroll-py': readonly ["scroll-pt", "scroll-pb"];
    };
    readonly conflictingClassGroupModifiers: {
        readonly 'font-size': readonly ["leading"];
    };
};
