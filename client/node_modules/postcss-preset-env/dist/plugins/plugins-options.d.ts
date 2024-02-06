import type { pluginOptions as postcssInitial } from '../types/postcss-initial/plugin-options';
import type { pluginOptions as postcssPseudoClassAnyLink } from 'postcss-pseudo-class-any-link';
import type { pluginOptions as postcssBlankPseudo } from 'css-blank-pseudo';
import type { pluginOptions as postcssPageBreak } from '../types/postcss-page-break/plugin-options';
import type { pluginOptions as postcssCascadeLayers } from '@csstools/postcss-cascade-layers';
import type { pluginOptions as postcssAttributeCaseInsensitive } from 'postcss-attribute-case-insensitive';
import type { pluginOptions as postcssClamp } from '../types/postcss-clamp/plugin-options';
import type { pluginOptions as postcssColorFunction } from '@csstools/postcss-color-function';
import type { pluginOptions as postcssColorFunctionalNotation } from 'postcss-color-functional-notation';
import type { pluginOptions as postcssColorMixFunction } from '@csstools/postcss-color-mix-function';
import type { pluginOptions as postcssCustomMedia } from 'postcss-custom-media';
import type { pluginOptions as postcssCustomProperties } from 'postcss-custom-properties';
import type { pluginOptions as postcssCustomSelectors } from 'postcss-custom-selectors';
import type { pluginOptions as postcssDirPseudoClass } from 'postcss-dir-pseudo-class';
import type { pluginOptions as postcssNormalizeDisplayValues } from '@csstools/postcss-normalize-display-values';
import type { pluginOptions as postcssDoublePositionGradients } from 'postcss-double-position-gradients';
import type { pluginOptions as postcssLogicalFloatAndClear } from '@csstools/postcss-logical-float-and-clear';
import type { pluginOptions as postcssFocusVisible } from 'postcss-focus-visible';
import type { pluginOptions as postcssFocusWithin } from 'postcss-focus-within';
import type { pluginOptions as postcssFontFormatKeywords } from '@csstools/postcss-font-format-keywords';
import type { pluginOptions as postcssFontVariant } from '../types/postcss-font-variant/plugin-options';
import type { pluginOptions as postcssGapProperties } from 'postcss-gap-properties';
import type { pluginOptions as postcssGradientsInterpolationMethod } from '@csstools/postcss-gradients-interpolation-method';
import type { pluginOptions as postcssHasPseudo } from 'css-has-pseudo';
import type { pluginOptions as postcssColorHexAlpha } from 'postcss-color-hex-alpha';
import type { pluginOptions as postcssHWBFunction } from '@csstools/postcss-hwb-function';
import type { pluginOptions as postcssICUnit } from '@csstools/postcss-ic-unit';
import type { pluginOptions as postcssImageSetFunction } from 'postcss-image-set-function';
import type { pluginOptions as postcssIsPseudoClass } from '@csstools/postcss-is-pseudo-class';
import type { pluginOptions as postcssLabFunction } from 'postcss-lab-function';
import type { pluginOptions as postcssLogical } from 'postcss-logical';
import type { pluginOptions as postcssLogicalResize } from '@csstools/postcss-logical-resize';
import type { pluginOptions as postcssLogicalViewportUnits } from '@csstools/postcss-logical-viewport-units';
import type { pluginOptions as postcssMediaQueriesAspectRatioNumberValues } from '@csstools/postcss-media-queries-aspect-ratio-number-values';
import type { pluginOptions as postcssMediaMinmax } from '@csstools/postcss-media-minmax';
import type { pluginOptions as postcssNestedCalc } from '@csstools/postcss-nested-calc';
import type { pluginOptions as postcssNesting } from 'postcss-nesting';
import type { pluginOptions as postcssSelectorNot } from 'postcss-selector-not';
import type { pluginOptions as postcssOKLabFunction } from '@csstools/postcss-oklab-function';
import type { pluginOptions as postcssOpacityPercentage } from '../types/postcss-opacity-percentage/plugin-options';
import type { pluginOptions as postcssOverflowShorthand } from 'postcss-overflow-shorthand';
import type { pluginOptions as postcssReplaceOverflowWrap } from '../types/postcss-replace-overflow-wrap/plugin-options';
import type { pluginOptions as postcssPlace } from 'postcss-place';
import type { pluginOptions as postcssPrefersColorScheme } from 'css-prefers-color-scheme';
import type { pluginOptions as postcssColorRebeccapurple } from 'postcss-color-rebeccapurple';
import type { pluginOptions as postcssRelativeColorSyntax } from '@csstools/postcss-relative-color-syntax';
import type { pluginOptions as postcssScopePseudoClass } from '@csstools/postcss-scope-pseudo-class';
import type { pluginOptions as postcssSteppedValueFunctions } from '@csstools/postcss-stepped-value-functions';
import type { pluginOptions as postcssFontFamilySystemUI } from '../types/postcss-system-ui-font-family/plugin-options';
import type { pluginOptions as postcssTextDecorationShorthand } from '@csstools/postcss-text-decoration-shorthand';
import type { pluginOptions as postcssTrigonometricFunctions } from '@csstools/postcss-trigonometric-functions';
import type { pluginOptions as postcssUnsetValue } from '@csstools/postcss-unset-value';
export type pluginsOptions = {
    /** plugin options for "postcss-initial" */
    'all-property'?: postcssInitial | boolean;
    /** plugin options for "postcss-pseudo-class-any-link" */
    'any-link-pseudo-class'?: postcssPseudoClassAnyLink | boolean;
    /** plugin options for "css-blank-pseudo" */
    'blank-pseudo-class'?: postcssBlankPseudo | boolean;
    /** plugin options for "postcss-page-break" */
    'break-properties'?: postcssPageBreak | boolean;
    /** plugin options for "@csstools/postcss-cascade-layers" */
    'cascade-layers'?: postcssCascadeLayers | boolean;
    /** plugin options for "postcss-attribute-case-insensitive" */
    'case-insensitive-attributes'?: postcssAttributeCaseInsensitive | boolean;
    /** plugin options for "postcss-clamp" */
    'clamp'?: postcssClamp | boolean;
    /** plugin options for "@csstools/postcss-color-function" */
    'color-function'?: postcssColorFunction | boolean;
    /** plugin options for "postcss-color-functional-notation" */
    'color-functional-notation'?: postcssColorFunctionalNotation | boolean;
    /** plugin options for "@csstools/postcss-color-mix-function" */
    'color-mix'?: postcssColorMixFunction | boolean;
    /** plugin options for "postcss-custom-media" */
    'custom-media-queries'?: postcssCustomMedia | boolean;
    /** plugin options for "postcss-custom-properties" */
    'custom-properties'?: postcssCustomProperties | boolean;
    /** plugin options for "postcss-custom-selectors" */
    'custom-selectors'?: postcssCustomSelectors | boolean;
    /** plugin options for "postcss-dir-pseudo-class" */
    'dir-pseudo-class'?: postcssDirPseudoClass | boolean;
    /** plugin options for "@csstools/postcss-normalize-display-values" */
    'display-two-values'?: postcssNormalizeDisplayValues | boolean;
    /** plugin options for "postcss-double-position-gradients" */
    'double-position-gradients'?: postcssDoublePositionGradients | boolean;
    /** plugin options for "@csstools/postcss-logical-float-and-clear" */
    'float-clear-logical-values'?: postcssLogicalFloatAndClear | boolean;
    /** plugin options for "postcss-focus-visible" */
    'focus-visible-pseudo-class'?: postcssFocusVisible | boolean;
    /** plugin options for "postcss-focus-within" */
    'focus-within-pseudo-class'?: postcssFocusWithin | boolean;
    /** plugin options for "@csstools/postcss-font-format-keywords" */
    'font-format-keywords'?: postcssFontFormatKeywords | boolean;
    /** plugin options for "postcss-font-variant" */
    'font-variant-property'?: postcssFontVariant | boolean;
    /** plugin options for "postcss-gap-properties" */
    'gap-properties'?: postcssGapProperties | boolean;
    /** plugin options for "@csstools/postcss-gradients-interpolation-method" */
    'gradients-interpolation-method'?: postcssGradientsInterpolationMethod | boolean;
    /** plugin options for "css-has-pseudo" */
    'has-pseudo-class'?: postcssHasPseudo | boolean;
    /** plugin options for "postcss-color-hex-alpha" */
    'hexadecimal-alpha-notation'?: postcssColorHexAlpha | boolean;
    /** plugin options for "@csstools/postcss-hwb-function" */
    'hwb-function'?: postcssHWBFunction | boolean;
    /** plugin options for "@csstools/postcss-ic-unit" */
    'ic-unit'?: postcssICUnit | boolean;
    /** plugin options for "postcss-image-set-function" */
    'image-set-function'?: postcssImageSetFunction | boolean;
    /** plugin options for "@csstools/postcss-is-pseudo-class" */
    'is-pseudo-class'?: postcssIsPseudoClass | boolean;
    /** plugin options for "postcss-lab-function" */
    'lab-function'?: postcssLabFunction | boolean;
    /** plugin options for "postcss-logical" */
    'logical-properties-and-values'?: postcssLogical | boolean;
    /** plugin options for "@csstools/postcss-logical-resize" */
    'logical-resize'?: postcssLogicalResize | boolean;
    /** plugin options for "@csstools/postcss-logical-viewport-units" */
    'logical-viewport-units'?: postcssLogicalViewportUnits | boolean;
    /** plugin options for "@csstools/postcss-media-queries-aspect-ratio-number-values" */
    'media-queries-aspect-ratio-number-values'?: postcssMediaQueriesAspectRatioNumberValues | boolean;
    /** plugin options for "@csstools/postcss-media-minmax" */
    'media-query-ranges'?: postcssMediaMinmax | boolean;
    /** plugin options for "@csstools/postcss-nested-calc" */
    'nested-calc'?: postcssNestedCalc | boolean;
    /** plugin options for "postcss-nesting" */
    'nesting-rules'?: postcssNesting | boolean;
    /** plugin options for "postcss-selector-not" */
    'not-pseudo-class'?: postcssSelectorNot | boolean;
    /** plugin options for "@csstools/postcss-oklab-function" */
    'oklab-function'?: postcssOKLabFunction | boolean;
    /** plugin options for "postcss-opacity-percentage" */
    'opacity-percentage'?: postcssOpacityPercentage | boolean;
    /** plugin options for "postcss-overflow-shorthand" */
    'overflow-property'?: postcssOverflowShorthand | boolean;
    /** plugin options for "postcss-replace-overflow-wrap" */
    'overflow-wrap-property'?: postcssReplaceOverflowWrap | boolean;
    /** plugin options for "postcss-place" */
    'place-properties'?: postcssPlace | boolean;
    /** plugin options for "css-prefers-color-scheme" */
    'prefers-color-scheme-query'?: postcssPrefersColorScheme | boolean;
    /** plugin options for "postcss-color-rebeccapurple" */
    'rebeccapurple-color'?: postcssColorRebeccapurple | boolean;
    /** plugin options for "@csstools/postcss-relative-color-syntax" */
    'relative-color-syntax'?: postcssRelativeColorSyntax | boolean;
    /** plugin options for "@csstools/postcss-scope-pseudo-class" */
    'scope-pseudo-class'?: postcssScopePseudoClass | boolean;
    /** plugin options for "@csstools/postcss-stepped-value-functions" */
    'stepped-value-functions'?: postcssSteppedValueFunctions | boolean;
    /** plugin options for "postcss-system-ui-font-family" */
    'system-ui-font-family'?: postcssFontFamilySystemUI | boolean;
    /** plugin options for "@csstools/postcss-text-decoration-shorthand" */
    'text-decoration-shorthand'?: postcssTextDecorationShorthand | boolean;
    /** plugin options for "@csstools/postcss-trigonometric-functions" */
    'trigonometric-functions'?: postcssTrigonometricFunctions | boolean;
    /** plugin options for "@csstools/postcss-unset-value" */
    'unset-value'?: postcssUnsetValue | boolean;
};
