import type { PluginCreator } from 'postcss';
import { DirectionFlow } from './lib/types';
/** postcss-logical-resize plugin options */
export type pluginOptions = {
    /** Sets the direction for block. default: top-to-bottom */
    blockDirection?: DirectionFlow;
    /** Sets the direction for inline. default: left-to-right */
    inlineDirection?: DirectionFlow;
};
declare const creator: PluginCreator<pluginOptions>;
export default creator;
