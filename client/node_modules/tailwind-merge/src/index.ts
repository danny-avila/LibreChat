import { twJoin } from './lib/tw-join'

export { createTailwindMerge } from './lib/create-tailwind-merge'
export { getDefaultConfig } from './lib/default-config'
export { extendTailwindMerge } from './lib/extend-tailwind-merge'
export { fromTheme } from './lib/from-theme'
export { mergeConfigs } from './lib/merge-configs'
export { twJoin, type ClassNameValue } from './lib/tw-join'
export { twMerge } from './lib/tw-merge'
export type { Config } from './lib/types'
export * as validators from './lib/validators'

/**
 * @deprecated Will be removed in next major version. Use `twJoin` instead.
 */
export const join = twJoin
