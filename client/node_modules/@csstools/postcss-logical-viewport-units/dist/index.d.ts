import type { PluginCreator } from 'postcss';
import { DirectionFlow } from './lib/types';
/** postcss-logical-viewport-units plugin options */
export type pluginOptions = {
    /** Preserve the original notation. default: false */
    preserve?: boolean;
    /** Sets the direction for inline. default: left-to-right */
    inlineDirection?: DirectionFlow;
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
