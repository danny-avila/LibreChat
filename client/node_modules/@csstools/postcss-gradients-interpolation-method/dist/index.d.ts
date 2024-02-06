import type { PluginCreator } from 'postcss';
/** postcss-gradients-interpolation-method plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: true */
    preserve?: boolean;
    /** Enable "@csstools/postcss-progressive-custom-properties". default: true */
    enableProgressiveCustomProperties?: boolean;
};
declare const postcssPlugin: PluginCreator<pluginOptions>;
export default postcssPlugin;
