import type { PluginCreator } from 'postcss';
/** postcss-pseudo-class-any-link plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: true */
    preserve?: boolean;
    /** Add an extra fallback for the "<area>" element in IE and Edge. default: false */
    subFeatures?: {
        areaHrefNeedsFixing?: boolean;
    };
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
