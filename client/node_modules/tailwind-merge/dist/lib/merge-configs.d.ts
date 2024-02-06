import { Config } from './types';
/**
 * @param baseConfig Config where other config will be merged into. This object will be mutated.
 * @param configExtension Partial config to merge into the `baseConfig`.
 */
export declare function mergeConfigs(baseConfig: Config, configExtension: Partial<Config>): Config;
