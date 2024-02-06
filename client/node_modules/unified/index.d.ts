// TypeScript Version: 4.0

// Note: this is a `.d.ts` file because it is not possible to have default type
// parameters in JSDoc-based TypeScript, which is a feature we use to type that:
//
// ```js
// .use(somePlugin, theOptions)
// ```
//
// `theOptions` matches the options that `somePlugin` expects and thus is very
// important for making unified usable in TypeScript.
//
// Furthermore, this is places in the root of the project because types that
// accept type parameters cannot be re-exported as such easily.

import {Node} from 'unist'
import {VFile, VFileCompatible} from 'vfile'

/* eslint-disable @typescript-eslint/naming-convention */

type VFileWithOutput<Result> = Result extends Uint8Array // Buffer.
  ? VFile
  : Result extends object // Custom result type
  ? VFile & {result: Result}
  : VFile

// Get the right most non-void thing.
type Specific<Left = void, Right = void> = Right extends void ? Left : Right

// Create a processor based on the input/output of a plugin.
type UsePlugin<
  ParseTree extends Node | void = void,
  CurrentTree extends Node | void = void,
  CompileTree extends Node | void = void,
  CompileResult = void,
  Input = void,
  Output = void
> = Output extends Node
  ? Input extends string
    ? // If `Input` is `string` and `Output` is `Node`, then this plugin
      // defines a parser, so set `ParseTree`.
      Processor<
        Output,
        Specific<Output, CurrentTree>,
        Specific<Output, CompileTree>,
        CompileResult
      >
    : Input extends Node
    ? // If `Input` is `Node` and `Output` is `Node`, then this plugin defines a
      // transformer, its output defines the input of the next, so set
      // `CurrentTree`.
      Processor<
        Specific<Input, ParseTree>,
        Output,
        Specific<CompileTree, Output>,
        CompileResult
      >
    : // Else, `Input` is something else and `Output` is `Node`:
      never
  : Input extends Node
  ? // If `Input` is `Node` and `Output` is not a `Node`, then this plugin
    // defines a compiler, so set `CompileTree` and `CompileResult`
    Processor<
      Specific<Input, ParseTree>,
      Specific<Input, CurrentTree>,
      Input,
      Output
    >
  : // Else, `Input` is not a `Node` and `Output` is not a `Node`.
    // Maybe it’s untyped, or the plugin throws an error (`never`), so lets
    // just keep it as it was.
    Processor<ParseTree, CurrentTree, CompileTree, CompileResult>

/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Processor allows plugins to be chained together to transform content.
 * The chain of plugins defines how content flows through it.
 *
 * @typeParam ParseTree
 *   The node that the parser yields (and `run` receives).
 * @typeParam CurrentTree
 *   The node that the last attached plugin yields.
 * @typeParam CompileTree
 *   The node that the compiler receives (and `run` yields).
 * @typeParam CompileResult
 *   The thing that the compiler yields.
 */
export interface Processor<
  ParseTree extends Node | void = void,
  CurrentTree extends Node | void = void,
  CompileTree extends Node | void = void,
  CompileResult = void
> extends FrozenProcessor<ParseTree, CurrentTree, CompileTree, CompileResult> {
  /**
   * Configure the processor to use a plugin.
   *
   * @typeParam PluginParameters
   *   Plugin settings.
   * @typeParam Input
   *   Value that is accepted by the plugin.
   *
   *   *   If the plugin returns a transformer, then this should be the node
   *       type that the transformer expects.
   *   *   If the plugin sets a parser, then this should be `string`.
   *   *   If the plugin sets a compiler, then this should be the node type that
   *       the compiler expects.
   * @typeParam Output
   *   Value that the plugin yields.
   *
   *   *   If the plugin returns a transformer, then this should be the node
   *       type that the transformer yields, and defaults to `Input`.
   *   *   If the plugin sets a parser, then this should be the node type that
   *       the parser yields.
   *   *   If the plugin sets a compiler, then this should be the result that
   *       the compiler yields (`string`, `Buffer`, or something else).
   * @param plugin
   *   Plugin (function) to use.
   *   Plugins are deduped based on identity: passing a function in twice will
   *   cause it to run only once.
   * @param settings
   *   Configuration for plugin, optional.
   *   Plugins typically receive one options object, but could receive other and
   *   more values.
   *   It’s also possible to pass a boolean instead of settings: `true` (to turn
   *   a plugin on) or `false` (to turn a plugin off).
   * @returns
   *   Current processor.
   */
  use<
    PluginParameters extends any[] = any[],
    Input = Specific<Node, CurrentTree>,
    Output = Input
  >(
    plugin: Plugin<PluginParameters, Input, Output>,
    ...settings: PluginParameters | [boolean]
  ): UsePlugin<
    ParseTree,
    CurrentTree,
    CompileTree,
    CompileResult,
    Input,
    Output
  >

  /**
   * Configure the processor with a tuple of a plugin and setting(s).
   *
   * @typeParam PluginParameters
   *   Plugin settings.
   * @typeParam Input
   *   Value that is accepted by the plugin.
   *
   *   *   If the plugin returns a transformer, then this should be the node
   *       type that the transformer expects.
   *   *   If the plugin sets a parser, then this should be `string`.
   *   *   If the plugin sets a compiler, then this should be the node type that
   *       the compiler expects.
   * @typeParam Output
   *   Value that the plugin yields.
   *
   *   *   If the plugin returns a transformer, then this should be the node
   *       type that the transformer yields, and defaults to `Input`.
   *   *   If the plugin sets a parser, then this should be the node type that
   *       the parser yields.
   *   *   If the plugin sets a compiler, then this should be the result that
   *       the compiler yields (`string`, `Buffer`, or something else).
   * @param tuple
   *   A tuple where the first item is a plugin (function) to use and other
   *   items are options.
   *   Plugins are deduped based on identity: passing a function in twice will
   *   cause it to run only once.
   *   It’s also possible to pass a boolean instead of settings: `true` (to turn
   *   a plugin on) or `false` (to turn a plugin off).
   * @returns
   *   Current processor.
   */
  use<
    PluginParameters extends any[] = any[],
    Input = Specific<Node, CurrentTree>,
    Output = Input
  >(
    tuple:
      | PluginTuple<PluginParameters, Input, Output>
      | [Plugin<PluginParameters, Input, Output>, boolean]
  ): UsePlugin<
    ParseTree,
    CurrentTree,
    CompileTree,
    CompileResult,
    Input,
    Output
  >

  /**
   * Configure the processor with a preset or list of plugins and presets.
   *
   * @param presetOrList
   *   Either a list of plugins, presets, and tuples, or a single preset: an
   *   object with a `plugins` (list) and/or `settings`
   *   (`Record<string, unknown>`).
   * @returns
   *   Current processor.
   */
  use(
    presetOrList: Preset | PluggableList
  ): Processor<ParseTree, CurrentTree, CompileTree, CompileResult>
}

/**
 * A frozen processor is just like a regular processor, except no additional
 * plugins can be added.
 * A frozen processor can be created by calling `.freeze()` on a processor.
 * An unfrozen processor can be created by calling a processor.
 */
export interface FrozenProcessor<
  ParseTree extends Node | void = void,
  CurrentTree extends Node | void = void,
  CompileTree extends Node | void = void,
  CompileResult = void
> {
  /**
   * Clone current processor
   *
   * @returns
   *   New unfrozen processor that is configured to function the same as its
   *   ancestor.
   *   But when the descendant processor is configured it does not affect the
   *   ancestral processor.
   */
  (): Processor<ParseTree, CurrentTree, CompileTree, CompileResult>

  /**
   * Internal list of configured plugins.
   *
   * @private
   */
  attachers: Array<[Plugin, ...unknown[]]>

  Parser?: Parser<Specific<Node, ParseTree>> | undefined
  Compiler?:
    | Compiler<Specific<Node, CompileTree>, Specific<unknown, CompileResult>>
    | undefined

  /**
   * Parse a file.
   *
   * @param file
   *   File to parse.
   *   `VFile` or anything that can be given to `new VFile()`, optional.
   * @returns
   *   Resulting tree.
   */
  parse(file?: VFileCompatible | undefined): Specific<Node, ParseTree>

  /**
   * Compile a file.
   *
   * @param node
   *   Node to compile.
   * @param file
   *   `VFile` or anything that can be given to `new VFile()`, optional.
   * @returns
   *   New content: compiled text (`string` or `Buffer`) or something else.
   *   This depends on which plugins you use: typically text, but could for
   *   example be a React node.
   */
  stringify(
    node: Specific<Node, CompileTree>,
    file?: VFileCompatible | undefined
  ): CompileTree extends Node ? CompileResult : unknown

  /**
   * Run transforms on the given tree.
   *
   * @param node
   *   Tree to transform.
   * @param callback
   *   Callback called with an error or the resulting node.
   * @returns
   *   Nothing.
   */
  run(
    node: Specific<Node, ParseTree>,
    callback: RunCallback<Specific<Node, CompileTree>>
  ): void

  /**
   * Run transforms on the given node.
   *
   * @param node
   *   Tree to transform.
   * @param file
   *   File associated with `node`.
   *   `VFile` or anything that can be given to `new VFile()`.
   * @param callback
   *   Callback called with an error or the resulting node.
   * @returns
   *   Nothing.
   */
  run(
    node: Specific<Node, ParseTree>,
    file: VFileCompatible | undefined,
    callback: RunCallback<Specific<Node, CompileTree>>
  ): void

  /**
   * Run transforms on the given node.
   *
   * @param node
   *   Tree to transform.
   * @param file
   *   File associated with `node`.
   *   `VFile` or anything that can be given to `new VFile()`.
   * @returns
   *   Promise that resolves to the resulting tree.
   */
  run(
    node: Specific<Node, ParseTree>,
    file?: VFileCompatible | undefined
  ): Promise<Specific<Node, CompileTree>>

  /**
   * Run transforms on the given node, synchronously.
   * Throws when asynchronous transforms are configured.
   *
   * @param node
   *   Tree to transform.
   * @param file
   *   File associated with `node`.
   *   `VFile` or anything that can be given to `new VFile()`, optional.
   * @returns
   *   Resulting tree.
   */
  runSync(
    node: Specific<Node, ParseTree>,
    file?: VFileCompatible | undefined
  ): Specific<Node, CompileTree>

  /**
   * Process a file.
   *
   * This performs all phases of the processor:
   *
   * 1.  Parse a file into a unist node using the configured `Parser`
   * 2.  Run transforms on that node
   * 3.  Compile the resulting node using the `Compiler`
   *
   * The result from the compiler is stored on the file.
   * What the result is depends on which plugins you use.
   * The result is typically text (`string` or `Buffer`), which can be retrieved
   * with `file.toString()` (or `String(file)`).
   * In some cases, such as when using `rehypeReact` to create a React node,
   * the result is stored on `file.result`.
   *
   * @param file
   *   `VFile` or anything that can be given to `new VFile()`.
   * @param callback
   *   Callback called with an error or the resulting file.
   * @returns
   *   Nothing.
   */
  process(
    file: VFileCompatible | undefined,
    callback: ProcessCallback<VFileWithOutput<CompileResult>>
  ): void

  /**
   * Process a file.
   *
   * This performs all phases of the processor:
   *
   * 1.  Parse a file into a unist node using the configured `Parser`
   * 2.  Run transforms on that node
   * 3.  Compile the resulting node using the `Compiler`
   *
   * The result from the compiler is stored on the file.
   * What the result is depends on which plugins you use.
   * The result is typically text (`string` or `Buffer`), which can be retrieved
   * with `file.toString()` (or `String(file)`).
   * In some cases, such as when using `rehypeReact` to create a React node,
   * the result is stored on `file.result`.
   *
   * @param file
   *   `VFile` or anything that can be given to `new VFile()`.
   * @returns
   *   Promise that resolves to the resulting `VFile`.
   */
  process(file: VFileCompatible): Promise<VFileWithOutput<CompileResult>>

  /**
   * Process a file, synchronously.
   * Throws when asynchronous transforms are configured.
   *
   * This performs all phases of the processor:
   *
   * 1.  Parse a file into a unist node using the configured `Parser`
   * 2.  Run transforms on that node
   * 3.  Compile the resulting node using the `Compiler`
   *
   * The result from the compiler is stored on the file.
   * What the result is depends on which plugins you use.
   * The result is typically text (`string` or `Buffer`), which can be retrieved
   * with `file.toString()` (or `String(file)`).
   * In some cases, such as when using `rehypeReact` to create a React node,
   * the result is stored on `file.result`.
   *
   * @param file
   *   `VFile` or anything that can be given to `new VFile()`, optional.
   * @returns
   *   Resulting file.
   */
  processSync(
    file?: VFileCompatible | undefined
  ): VFileWithOutput<CompileResult>

  /**
   * Get an in-memory key-value store accessible to all phases of the process.
   *
   * @returns
   *   Key-value store.
   */
  data(): Record<string, unknown>

  /**
   * Set an in-memory key-value store accessible to all phases of the process.
   *
   * @param data
   *   Key-value store.
   * @returns
   *   Current processor.
   */
  data(
    data: Record<string, unknown>
  ): Processor<ParseTree, CurrentTree, CompileTree, CompileResult>

  /**
   * Get an in-memory value by key.
   *
   * @param key
   *   Key to get.
   * @returns
   *   The value at `key`.
   */
  data(key: string): unknown

  /**
   * Set an in-memory value by key.
   *
   * @param key
   *   Key to set.
   * @param value
   *   Value to set.
   * @returns
   *   Current processor.
   */
  data(
    key: string,
    value: unknown
  ): Processor<ParseTree, CurrentTree, CompileTree, CompileResult>

  /**
   * Freeze a processor.
   * Frozen processors are meant to be extended and not to be configured or
   * processed directly.
   *
   * Once a processor is frozen it cannot be unfrozen.
   * New processors working just like it can be created by calling the
   * processor.
   *
   * It’s possible to freeze processors explicitly, by calling `.freeze()`, but
   * `.parse()`, `.run()`, `.stringify()`, and `.process()` call `.freeze()` to
   * freeze a processor too.
   *
   * @returns
   *   Frozen processor.
   */
  freeze(): FrozenProcessor<ParseTree, CurrentTree, CompileTree, CompileResult>
}

/**
 * A plugin is a function.
 * It configures the processor and in turn can receive options.
 * Plugins can configure processors by interacting with parsers and compilers
 * (at `this.Parser` or `this.Compiler`) or by specifying how the syntax tree
 * is handled (by returning a `Transformer`).
 *
 * @typeParam PluginParameters
 *   Plugin settings.
 * @typeParam Input
 *   Value that is accepted by the plugin.
 *
 *   *   If the plugin returns a transformer, then this should be the node
 *       type that the transformer expects.
 *   *   If the plugin sets a parser, then this should be `string`.
 *   *   If the plugin sets a compiler, then this should be the node type that
 *       the compiler expects.
 * @typeParam Output
 *   Value that the plugin yields.
 *
 *   *   If the plugin returns a transformer, then this should be the node
 *       type that the transformer yields, and defaults to `Input`.
 *   *   If the plugin sets a parser, then this should be the node type that
 *       the parser yields.
 *   *   If the plugin sets a compiler, then this should be the result that
 *       the compiler yields (`string`, `Buffer`, or something else).
 * @this
 *   The current processor.
 *   Plugins can configure the processor by interacting with `this.Parser` or
 *   `this.Compiler`, or by accessing the data associated with the whole process
 *   (`this.data`).
 * @param settings
 *   Configuration for plugin.
 *   Plugins typically receive one options object, but could receive other and
 *   more values.
 *   Users can also pass a boolean instead of settings: `true` (to turn
 *   a plugin on) or `false` (to turn a plugin off).
 *   When a plugin is turned off, it won’t be called.
 *
 *   When creating your own plugins, please accept only a single object!
 *   It allows plugins to be reconfigured and it helps users to know that every
 *   plugin accepts one options object.
 * @returns
 *   Plugins can return a `Transformer` to specify how the syntax tree is
 *   handled.
 */
export type Plugin<
  PluginParameters extends any[] = any[],
  Input = Node,
  Output = Input
> = (
  this: Input extends Node
    ? Output extends Node
      ? // This is a transform, so define `Input` as the current tree.
        Processor<void, Input>
      : // Compiler.
        Processor<void, Input, Input, Output>
    : Output extends Node
    ? // Parser.
      Processor<Output, Output>
    : // No clue.
      Processor,
  ...settings: PluginParameters
) => // If both `Input` and `Output` are `Node`, expect an optional `Transformer`.
Input extends Node
  ? Output extends Node
    ? Transformer<Input, Output> | void
    : void
  : void

/**
 * Presets provide a sharable way to configure processors with multiple plugins
 * and/or settings.
 */
export interface Preset {
  plugins?: PluggableList
  settings?: Record<string, unknown>
}

/**
 * A tuple of a plugin and its setting(s).
 * The first item is a plugin (function) to use and other items are options.
 * Plugins are deduped based on identity: passing a function in twice will
 * cause it to run only once.
 *
 * @typeParam PluginParameters
 *   Plugin settings.
 * @typeParam Input
 *   Value that is accepted by the plugin.
 *
 *   *   If the plugin returns a transformer, then this should be the node
 *       type that the transformer expects.
 *   *   If the plugin sets a parser, then this should be `string`.
 *   *   If the plugin sets a compiler, then this should be the node type that
 *       the compiler expects.
 * @typeParam Output
 *   Value that the plugin yields.
 *
 *   *   If the plugin returns a transformer, then this should be the node
 *       type that the transformer yields, and defaults to `Input`.
 *   *   If the plugin sets a parser, then this should be the node type that
 *       the parser yields.
 *   *   If the plugin sets a compiler, then this should be the result that
 *       the compiler yields (`string`, `Buffer`, or something else).
 */
export type PluginTuple<
  PluginParameters extends any[] = any[],
  Input = Node,
  Output = Input
> = [Plugin<PluginParameters, Input, Output>, ...PluginParameters]

/**
 * A union of the different ways to add plugins and settings.
 *
 * @typeParam PluginParameters
 *   Plugin settings.
 */
export type Pluggable<PluginParameters extends any[] = any[]> =
  | PluginTuple<PluginParameters, any, any>
  | Plugin<PluginParameters, any, any>
  | Preset

/**
 * A list of plugins and presets.
 */
export type PluggableList = Pluggable[]

/**
 * @deprecated
 *   Please use `Plugin`.
 */
export type Attacher<
  PluginParameters extends any[] = any[],
  Input = Node,
  Output = Input
> = Plugin<PluginParameters, Input, Output>

/**
 * Transformers modify the syntax tree or metadata of a file.
 * A transformer is a function that is called each time a file is passed
 * through the transform phase.
 * If an error occurs (either because it’s thrown, returned, rejected, or passed
 * to `next`), the process stops.
 *
 * @typeParam Input
 *   Node type that the transformer expects.
 * @typeParam Output
 *   Node type that the transformer yields.
 * @param node
 *   Tree to be transformed.
 * @param file
 *   File associated with node.
 * @param next
 *   Callback that you must call when done.
 *   Note: this is given if you accept three parameters in your transformer.
 *   If you accept up to two parameters, it’s not given, and you can return
 *   a promise.
 * @returns
 *   Any of the following:
 *
 *   * `void` — If nothing is returned, the next transformer keeps using same
 *     tree.
 *   * `Error` — Can be returned to stop the process.
 *   * `Node` — Can be returned and results in further transformations and
 *     `stringify`s to be performed on the new tree.
 *   * `Promise` — If a promise is returned, the function is asynchronous, and
 *      must be resolved (optionally with a `Node`) or rejected (optionally with
 *      an `Error`).
 *
 *   If you accept a `next` callback, nothing should be returned.
 */
export type Transformer<
  Input extends Node = Node,
  Output extends Node = Input
> = (
  node: Input,
  file: VFile,
  next: TransformCallback<Output>
) => Promise<Output | undefined | void> | Output | Error | undefined | void

/**
 * Callback you must call when a transformer is done.
 *
 * @typeParam Tree
 *   Node that the plugin yields.
 * @param error
 *   Pass an error to stop the process.
 * @param node
 *   Pass a tree to continue transformations (and `stringify`) on the new tree.
 * @param file
 *   Pass a file to continue transformations (and `stringify`) on the new file.
 * @returns
 *   Nothing.
 */
export type TransformCallback<Tree extends Node = Node> = (
  error?: Error | null | undefined,
  node?: Tree | undefined,
  file?: VFile | undefined
) => void

/**
 * Function handling the parsing of text to a syntax tree.
 * Used in the parse phase in the process and called with a `string` and
 * `VFile` representation of the document to parse.
 *
 * `Parser` can be a normal function, in which case it must return a `Node`:
 * the syntax tree representation of the given file.
 *
 * `Parser` can also be a constructor function (a function with keys in its
 * `prototype`), in which case it’s called with `new`.
 * Instances must have a parse method that is called without arguments and
 * must return a `Node`.
 *
 * @typeParam Tree
 *   The node that the parser yields (and `run` receives).
 */
export type Parser<Tree extends Node = Node> =
  | ParserClass<Tree>
  | ParserFunction<Tree>

/**
 * A class to parse files.
 *
 * @typeParam Tree
 *   The node that the parser yields.
 */
export class ParserClass<Tree extends Node = Node> {
  prototype: {
    /**
     * Parse a file.
     *
     * @returns
     *   Parsed tree.
     */
    parse(): Tree
  }

  /**
   * Constructor.
   *
   * @param document
   *   Document to parse.
   * @param file
   *   File associated with `document`.
   * @returns
   *   Instance.
   */
  constructor(document: string, file: VFile)
}

/**
 * Normal function to parse a file.
 *
 * @typeParam Tree
 *   The node that the parser yields.
 * @param document
 *   Document to parse.
 * @param file
 *   File associated with `document`.
 * @returns
 *   Node representing the given file.
 */
export type ParserFunction<Tree extends Node = Node> = (
  document: string,
  file: VFile
) => Tree

/**
 * Function handling the compilation of syntax tree to a text.
 * Used in the stringify phase in the process and called with a `Node` and
 * `VFile` representation of the document to stringify.
 *
 * `Compiler` can be a normal function, in which case it must return a
 * `string`: the text representation of the given syntax tree.
 *
 * `Compiler` can also be a constructor function (a function with keys in its
 * `prototype`), in which case it’s called with `new`.
 * Instances must have a `compile` method that is called without arguments
 * and must return a `string`.
 *
 * @typeParam Tree
 *   The node that the compiler receives.
 * @typeParam Result
 *   The thing that the compiler yields.
 */
export type Compiler<Tree extends Node = Node, Result = unknown> =
  | CompilerClass<Tree, Result>
  | CompilerFunction<Tree, Result>

/**
 * A class to compile trees.
 *
 * @typeParam Tree
 *   The node that the compiler receives.
 * @typeParam Result
 *   The thing that the compiler yields.
 */
export class CompilerClass<Tree extends Node = Node, Result = unknown> {
  prototype: {
    /**
     * Compile a tree.
     *
     * @returns
     *   New content: compiled text (`string` or `Buffer`, for `file.value`) or
     *   something else (for `file.result`).
     */
    compile(): Result
  }

  /**
   * Constructor.
   *
   * @param tree
   *   Tree to compile.
   * @param file
   *   File associated with `tree`.
   * @returns
   *   Instance.
   */
  constructor(tree: Tree, file: VFile)
}

/**
 * Normal function to compile a tree.
 *
 * @typeParam Tree
 *   The node that the compiler receives.
 * @typeParam Result
 *   The thing that the compiler yields.
 * @param tree
 *   Tree to compile.
 * @param file
 *   File associated with `tree`.
 * @returns
 *   New content: compiled text (`string` or `Buffer`, for `file.value`) or
 *   something else (for `file.result`).
 */
export type CompilerFunction<Tree extends Node = Node, Result = unknown> = (
  tree: Tree,
  file: VFile
) => Result

/**
 * Callback called when a done running.
 *
 * @typeParam Tree
 *   The tree that the callback receives.
 * @param error
 *   Error passed when unsuccessful.
 * @param node
 *   Tree to transform.
 * @param file
 *   File passed when successful.
 * @returns
 *   Nothing.
 */
export type RunCallback<Tree extends Node = Node> = (
  error?: Error | null | undefined,
  node?: Tree | undefined,
  file?: VFile | undefined
) => void

/**
 * Callback called when a done processing.
 *
 * @typeParam File
 *   The file that the callback receives.
 * @param error
 *   Error passed when unsuccessful.
 * @param file
 *   File passed when successful.
 * @returns
 *   Nothing.
 */
export type ProcessCallback<File extends VFile = VFile> = (
  error?: Error | null | undefined,
  file?: File | undefined
) => void

/**
 * A frozen processor.
 */
export function unified(): Processor
