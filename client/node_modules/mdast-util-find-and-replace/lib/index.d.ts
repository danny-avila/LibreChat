/**
 * Find patterns in a tree and replace them.
 *
 * The algorithm searches the tree in *preorder* for complete values in `Text`
 * nodes.
 * Partial matches are not supported.
 *
 * @param tree
 *   Tree to change.
 * @param find
 *   Patterns to find.
 * @param replace
 *   Things to replace with (when `find` is `Find`) or configuration.
 * @param options
 *   Configuration (when `find` is not `Find`).
 * @returns
 *   Given, modified, tree.
 */
export const findAndReplace: (<Tree extends Node>(
  tree: Tree,
  find: Find,
  replace?: Replace | null | undefined,
  options?: Options | null | undefined
) => Tree) &
  (<Tree_1 extends Node>(
    tree: Tree_1,
    schema: FindAndReplaceSchema | FindAndReplaceList,
    options?: Options | null | undefined
  ) => Tree_1)
export type MdastParent = import('mdast').Parent
export type Root = import('mdast').Root
export type Content = import('mdast').Content
export type PhrasingContent = import('mdast').PhrasingContent
export type Text = import('mdast').Text
export type Test = import('unist-util-visit-parents').Test
export type VisitorResult = import('unist-util-visit-parents').VisitorResult
export type Node = Content | Root
export type Parent = Extract<Node, MdastParent>
export type ContentParent = Exclude<Parent, Root>
/**
 * Info on the match.
 */
export type RegExpMatchObject = {
  /**
   * The index of the search at which the result was found.
   */
  index: number
  /**
   * A copy of the search string in the text node.
   */
  input: string
  /**
   * All ancestors of the text node, where the last node is the text itself.
   */
  stack: [Root, ...Array<ContentParent>, Text]
}
/**
 * Callback called when a search matches.
 */
export type ReplaceFunction = (
  ...parameters: any[]
) =>
  | Array<PhrasingContent>
  | PhrasingContent
  | string
  | false
  | undefined
  | null
/**
 * Pattern to find.
 *
 * Strings are escaped and then turned into global expressions.
 */
export type Find = string | RegExp
/**
 * Several find and replaces, in array form.
 */
export type FindAndReplaceList = Array<[Find, Replace]>
/**
 * Several find and replaces, in object form.
 */
export type FindAndReplaceSchema = Record<string, Replace>
/**
 * Find and replace in tuple form.
 */
export type FindAndReplaceTuple = [Find, Replace]
/**
 * Thing to replace with.
 */
export type Replace = string | ReplaceFunction
/**
 * Normalized find and replace.
 */
export type Pair = [RegExp, ReplaceFunction]
/**
 * All find and replaced.
 */
export type Pairs = Array<[RegExp, ReplaceFunction]>
/**
 * Configuration.
 */
export type Options = {
  /**
   * Test for which nodes to ignore.
   */
  ignore?: Test | null | undefined
}
