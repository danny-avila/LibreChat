import type { PluginCreator } from 'postcss';
/** postcss-selector-not plugin options */
export type pluginOptions = Record<string, never>;
declare const creator: PluginCreator<pluginOptions>;
export default creator;
