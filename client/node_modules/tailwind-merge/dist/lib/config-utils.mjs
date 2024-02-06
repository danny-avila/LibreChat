import { createClassUtils } from './class-utils.mjs';
import { createLruCache } from './lru-cache.mjs';
import { createSplitModifiers } from './modifier-utils.mjs';

function createConfigUtils(config) {
  return {
    cache: createLruCache(config.cacheSize),
    splitModifiers: createSplitModifiers(config),
    ...createClassUtils(config)
  };
}

export { createConfigUtils };
//# sourceMappingURL=config-utils.mjs.map
