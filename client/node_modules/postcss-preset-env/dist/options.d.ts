import type autoprefixer from 'autoprefixer';
import { pluginsOptions } from './plugins/plugins-options';
export declare enum DirectionFlow {
    TopToBottom = "top-to-bottom",
    BottomToTop = "bottom-to-top",
    RightToLeft = "right-to-left",
    LeftToRight = "left-to-right"
}
export type pluginOptions = {
    /**
     * Determine which CSS features to polyfill,
     * based upon their process in becoming web standards.
     * default: 2
     */
    stage?: number | false;
    /**
     * Determine which CSS features to polyfill,
     * based their implementation status.
     * default: 0
     */
    minimumVendorImplementations?: number;
    /**
     * Enable any feature that would need an extra browser library to be loaded into the page for it to work.
     * default: false
     */
    enableClientSidePolyfills?: boolean;
    /**
     * PostCSS Preset Env supports any standard browserslist configuration,
     * which can be a `.browserslistrc` file,
     * a `browserslist` key in `package.json`,
     * or `browserslist` environment variables.
     *
     * The `browsers` option should only be used when a standard browserslist configuration is not available.
     */
    browsers?: string | Array<string> | null;
    /**
     * Determine whether all plugins should receive a `preserve` option,
     * which may preserve or remove the original and now polyfilled CSS.
     * Each plugin has it's own default, some true, others false.
     * default: _not set_
     */
    preserve?: boolean;
    /**
     * [Configure autoprefixer](https://github.com/postcss/autoprefixer#options)
     */
    autoprefixer?: autoprefixer.Options;
    /**
     * Enable or disable specific polyfills by ID.
     * Passing `true` to a specific [feature ID](https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-preset-env/FEATURES.md) will enable its polyfill,
     * while passing `false` will disable it.
     *
     * Passing an object to a specific feature ID will both enable and configure it.
     */
    features?: pluginsOptions;
    /**
     * The `insertBefore` key allows you to insert other PostCSS plugins into the chain.
     * This is only useful if you are also using sugary PostCSS plugins that must execute before certain polyfills.
     * `insertBefore` supports chaining one or multiple plugins.
    */
    insertBefore?: Record<string, unknown>;
    /**
     * The `insertAfter` key allows you to insert other PostCSS plugins into the chain.
     * This is only useful if you are also using sugary PostCSS plugins that must execute after certain polyfills.
     * `insertAfter` supports chaining one or multiple plugins.
    */
    insertAfter?: Record<string, unknown>;
    /**
     * Enable debugging messages to stdout giving insights into which features have been enabled/disabled and why.
     * default: false
     */
    debug?: boolean;
    /**
     * The `logical` object allows to configure all plugins related to logical document flow at once.
     * It accepts the same options as each plugin: `inlineDirection` and `blockDirection`.
     */
    logical?: {
        /** Set the inline flow direction. default: left-to-right */
        inlineDirection?: DirectionFlow;
        /** Set the block flow direction. default: top-to-bottom */
        blockDirection?: DirectionFlow;
    };
};
