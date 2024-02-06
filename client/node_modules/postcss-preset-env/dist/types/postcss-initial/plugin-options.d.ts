/** postcss-initial plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: false */
    preserve?: boolean;
    /**
     * Describes what subset of rules should be unsetted with all property (to reduce code weight).
     * Possible subsets: all, inherited.
     * default: 'all'.
     * */
    reset?: string;
};
