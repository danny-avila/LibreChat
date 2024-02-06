import type { PluginCreator } from 'postcss';
/** css-blank-pseudo plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: true */
    preserve?: boolean;
    /** Replacement for ":blank". default: "[blank]" */
    replaceWith?: string;
    /** Do not inject "js-blank-pseudo" before each selector with "[blank]". default: false */
    disablePolyfillReadyClass?: boolean;
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
