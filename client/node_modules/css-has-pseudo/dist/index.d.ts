import type { PluginCreator } from 'postcss';
/** css-has-pseudo plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: true */
    preserve?: boolean;
    /** Change the selector that is used to adjust specificity. default: "does-not-exist" */
    specificityMatchingName?: string;
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
