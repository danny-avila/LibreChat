/**
 * Transform a `parse5` AST to hast.
 *
 * @param {P5Node} tree
 *   `parse5` tree to transform.
 * @param {Options | VFile | null | undefined} [options]
 *   Configuration.
 * @returns {Node}
 *   hast tree.
 */
export function fromParse5(tree: P5Node, options?: Options | VFile | null | undefined): Node;
export type VFile = import('vfile').VFile;
export type Schema = import('property-information').Schema;
export type Position = import('unist').Position;
export type Point = import('unist').Point;
export type Element = import('hast').Element;
export type Root = import('hast').Root;
export type Content = import('hast').Content;
export type DefaultTreeAdapterMap = import('parse5').DefaultTreeAdapterMap;
export type P5ElementLocation = import('parse5').Token.ElementLocation;
export type P5Location = import('parse5').Token.Location;
export type Node = Content | Root;
export type P5Document = DefaultTreeAdapterMap['document'];
export type P5DocumentFragment = DefaultTreeAdapterMap['documentFragment'];
export type P5DocumentType = DefaultTreeAdapterMap['documentType'];
export type P5Comment = DefaultTreeAdapterMap['commentNode'];
export type P5Text = DefaultTreeAdapterMap['textNode'];
export type P5Element = DefaultTreeAdapterMap['element'];
export type P5Node = DefaultTreeAdapterMap['node'];
export type P5Template = DefaultTreeAdapterMap['template'];
/**
 * Namespace.
 */
export type Space = 'html' | 'svg';
/**
 * Configuration.
 */
export type Options = {
    /**
     * Which space the document is in.
     *
     * When an `<svg>` element is found in the HTML space, this package already
     * automatically switches to and from the SVG space when entering and exiting
     * it.
     */
    space?: Space | null | undefined;
    /**
     * File used to add positional info to nodes.
     *
     * If given, the file should represent the original HTML source.
     */
    file?: VFile | null | undefined;
    /**
     * Whether to add extra positional info about starting tags, closing tags,
     * and attributes to elements.
     *
     * > 👉 **Note**: only used when `file` is given.
     */
    verbose?: boolean | undefined;
};
/**
 * Info passed around about the current state.
 */
export type State = {
    /**
     * Current schema.
     */
    schema: Schema;
    /**
     * Corresponding file.
     */
    file: VFile | undefined;
    /**
     * Add extra positional info.
     */
    verbose: boolean | undefined;
    /**
     * Whether location info was found.
     */
    location: boolean;
};
