import React, { type ElementType, type Ref } from 'react';
import type { Props } from '../../types.js';
import { type HasDisplayName, type RefProp } from '../../utils/render.js';
declare let DEFAULT_CHECKBOX_TAG: "span";
type CheckboxRenderPropArg = {
    checked: boolean;
    changing: boolean;
    focus: boolean;
    active: boolean;
    hover: boolean;
    autofocus: boolean;
    disabled: boolean;
    indeterminate: boolean;
};
type CheckboxPropsWeControl = 'aria-checked' | 'aria-describedby' | 'aria-disabled' | 'aria-labelledby' | 'role' | 'tabIndex';
export type CheckboxProps<TTag extends ElementType = typeof DEFAULT_CHECKBOX_TAG, TType = string> = Props<TTag, CheckboxRenderPropArg, CheckboxPropsWeControl, {
    value?: TType;
    disabled?: boolean;
    indeterminate?: boolean;
    checked?: boolean;
    defaultChecked?: boolean;
    autoFocus?: boolean;
    form?: string;
    name?: string;
    onChange?: (checked: boolean) => void;
}>;
declare function CheckboxFn<TTag extends ElementType = typeof DEFAULT_CHECKBOX_TAG, TType = any>(props: CheckboxProps<TTag, TType>, ref: Ref<HTMLElement>): React.JSX.Element;
export interface _internal_ComponentCheckbox extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_CHECKBOX_TAG, TType = string>(props: CheckboxProps<TTag, TType> & RefProp<typeof CheckboxFn>): JSX.Element;
}
export declare let Checkbox: _internal_ComponentCheckbox;
export {};
