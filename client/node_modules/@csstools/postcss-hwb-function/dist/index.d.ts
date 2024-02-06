import type { PluginCreator } from 'postcss';
/** postcss-hwb-function plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: false */
    preserve?: boolean;
};
/** Transform hwb() functions in CSS. */
declare const postcssPlugin: PluginCreator<pluginOptions>;
export default postcssPlugin;
