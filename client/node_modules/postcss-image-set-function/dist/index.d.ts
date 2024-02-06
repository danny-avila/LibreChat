import type { PluginCreator } from 'postcss';
/** postcss-image-set-function plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: true */
    preserve?: boolean;
    /**
     * Determine how invalid usage of `image-set()` should be handled.
     * By default, invalid usages of `image-set()` are ignored.
     * They can be configured to emit a warning with `warn` or throw an exception with `throw`.
     * default: 'ignore'
     */
    onInvalid?: 'warn' | 'throw' | 'ignore' | false;
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
