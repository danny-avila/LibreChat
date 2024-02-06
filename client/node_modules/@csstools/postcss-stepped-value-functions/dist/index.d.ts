import type { PluginCreator } from 'postcss';
/** postcss-stepped-value-functions plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: false */
    preserve?: boolean;
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
