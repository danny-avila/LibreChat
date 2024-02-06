import type { PluginCreator } from 'postcss';
/** postcss-dir-pseudo-class plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: true */
    preserve?: boolean;
    /** Assume a direction for the document. default: null */
    dir?: 'ltr' | 'rtl';
    /** Assume that the CSS is intended to be used in Shadow DOM with Custom Elements. default: false */
    shadow?: boolean;
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
