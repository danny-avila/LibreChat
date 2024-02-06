import { twJoin } from './lib/tw-join.mjs';
export { createTailwindMerge } from './lib/create-tailwind-merge.mjs';
export { getDefaultConfig } from './lib/default-config.mjs';
export { extendTailwindMerge } from './lib/extend-tailwind-merge.mjs';
export { fromTheme } from './lib/from-theme.mjs';
export { mergeConfigs } from './lib/merge-configs.mjs';
export { twMerge } from './lib/tw-merge.mjs';
import * as validators from './lib/validators.mjs';
export { validators };

/**
 * @deprecated Will be removed in next major version. Use `twJoin` instead.
 */
var join = twJoin;

export { join, twJoin };
//# sourceMappingURL=tailwind-merge.mjs.map
