import { type ElementType } from 'react';
import type { Props } from '../../types.js';
import { type HasDisplayName } from '../../utils/render.js';
declare let DEFAULT_FIELD_TAG: "div";
type FieldRenderPropArg = {};
type FieldPropsWeControl = never;
export type FieldProps<TTag extends ElementType = typeof DEFAULT_FIELD_TAG> = Props<TTag, FieldRenderPropArg, FieldPropsWeControl, {
    disabled?: boolean;
}>;
export interface _internal_ComponentField extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_FIELD_TAG>(props: FieldProps<TTag>): JSX.Element;
}
export declare let Field: _internal_ComponentField;
export {};
