import type { PluginCreator } from 'postcss';
/** postcss-is-pseudo-class plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: false */
    preserve?: boolean;
    /**
     * Warn on complex selectors in `:is` pseudo class functions.
     * default: _not set_
    */
    onComplexSelector?: 'warning';
    /**
     * Warn when pseudo elements are used in `:is` pseudo class functions.
     * default: _not set_
    */
    onPseudoElement?: 'warning';
    /**
     * Change the selector used to adjust specificity.
     * default: `does-not-exist`.
     */
    specificityMatchingName?: string;
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
