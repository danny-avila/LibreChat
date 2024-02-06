import type {Reporter} from './lib/index.js'

/**
 * This is the same as `Buffer` if node types are included, `never` otherwise.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
// @ts-ignore It’s important to preserve this ignore statement. This makes sure
// it works both with and without node types.
// eslint-disable-next-line n/prefer-global/buffer
type MaybeBuffer = any extends Buffer ? never : Buffer

/**
 * Contents of the file.
 *
 * Can either be text or a `Buffer` structure.
 */
// Note: this does not directly use type `Buffer`, because it can also be used
// in a browser context.
// Instead this leverages `Uint8Array` which is the base type for `Buffer`,
// and a native JavaScript construct.
export type Value = string | MaybeBuffer

/**
 * This map registers the type of the `data` key of a `VFile`.
 *
 * This type can be augmented to register custom `data` types.
 *
 * @example
 * declare module 'vfile' {
 *   interface DataMap {
 *     // `file.data.name` is typed as `string`
 *     name: string
 *   }
 * }
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-interface
export interface DataMap {}

/**
 * Custom information.
 *
 * Known attributes can be added to @see {@link DataMap}
 */
export type Data = Record<string, unknown> & Partial<DataMap>

// Deprecated names (w/ prefix):
export type {Data as VFileData, DataMap as VFileDataMap, Value as VFileValue}

export {VFile} from './lib/index.js'

export type {
  BufferEncoding,
  Map,
  Compatible,
  Options,
  Reporter,
  ReporterSettings,
  // Deprecated names (w/ prefix):
  Compatible as VFileCompatible,
  Options as VFileOptions,
  Reporter as VFileReporter,
  ReporterSettings as VFileReporterSettings
} from './lib/index.js'
