import type { PluginCreator } from 'postcss';
/** postcss-overflow-shorthand plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: true */
    preserve?: boolean;
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
