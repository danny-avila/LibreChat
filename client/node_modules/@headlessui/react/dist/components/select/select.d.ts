import { type ElementType, type Ref } from 'react';
import type { Props } from '../../types.js';
import { type HasDisplayName, type RefProp } from '../../utils/render.js';
declare let DEFAULT_SELECT_TAG: "select";
type SelectRenderPropArg = {
    disabled: boolean;
    hover: boolean;
    focus: boolean;
    active: boolean;
    autofocus: boolean;
    invalid: boolean;
};
type SelectPropsWeControl = 'aria-labelledby' | 'aria-describedby';
export type SelectProps<TTag extends ElementType = typeof DEFAULT_SELECT_TAG> = Props<TTag, SelectRenderPropArg, SelectPropsWeControl, {
    disabled?: boolean;
    invalid?: boolean;
    autoFocus?: boolean;
}>;
declare function SelectFn<TTag extends ElementType = typeof DEFAULT_SELECT_TAG>(props: SelectProps<TTag>, ref: Ref<HTMLElement>): import("react").ReactElement<any, string | import("react").JSXElementConstructor<any>> | null;
export interface _internal_ComponentSelect extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_SELECT_TAG>(props: SelectProps<TTag> & RefProp<typeof SelectFn>): JSX.Element;
}
export declare let Select: _internal_ComponentSelect;
export {};
