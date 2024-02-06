/** @constant {string} INVALID_LAYER_NAME Used to replace "layer" temporarily when an invalid layer is detected. This allows us to ignore this rule in further processing. */
export declare const INVALID_LAYER_NAME = "csstools-invalid-layer";
/** @constant {string} WITH_SELECTORS_LAYER_NAME Used to replace "layer" temporarily for any layer at rules that contain selectors. This allows us to sort these differently from other layer at rules. */
export declare const WITH_SELECTORS_LAYER_NAME = "csstools-layer-with-selector-rules";
export declare const ANONYMOUS_LAYER_SUFFIX = "6efdb677-bb05-44e5-840f-29d2175862fd";
export declare const IMPLICIT_LAYER_SUFFIX = "b147acf6-11a6-4338-a4d0-80aef4cd1a2f";
export declare const CONDITIONAL_ATRULES: string[];
export declare const ATRULES_WITH_NON_SELECTOR_BLOCK_LISTS: string[];
