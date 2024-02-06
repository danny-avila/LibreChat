import { type ElementType } from 'react';
import type { Props } from '../../types.js';
import { type HasDisplayName } from '../../utils/render.js';
declare let DEFAULT_FIELDSET_TAG: "div";
type FieldsetRenderPropArg = {};
type FieldsetPropsWeControl = 'aria-controls';
export type FieldsetProps<TTag extends ElementType = typeof DEFAULT_FIELDSET_TAG> = Props<TTag, FieldsetRenderPropArg, FieldsetPropsWeControl, {
    disabled?: boolean;
}>;
export interface _internal_ComponentFieldset extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_FIELDSET_TAG>(props: FieldsetProps<TTag>): JSX.Element;
}
export declare let Fieldset: _internal_ComponentFieldset;
export {};
