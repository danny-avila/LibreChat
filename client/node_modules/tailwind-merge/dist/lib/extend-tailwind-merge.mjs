import { createTailwindMerge } from './create-tailwind-merge.mjs';
import { getDefaultConfig } from './default-config.mjs';
import { mergeConfigs } from './merge-configs.mjs';

function extendTailwindMerge(configExtension) {
  for (var _len = arguments.length, createConfig = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    createConfig[_key - 1] = arguments[_key];
  }
  return typeof configExtension === 'function' ? createTailwindMerge.apply(void 0, [getDefaultConfig, configExtension].concat(createConfig)) : createTailwindMerge.apply(void 0, [function () {
    return mergeConfigs(getDefaultConfig(), configExtension);
  }].concat(createConfig));
}

export { extendTailwindMerge };
//# sourceMappingURL=extend-tailwind-merge.mjs.map
