import { type ElementType, type Ref } from 'react';
import type { Props } from '../../types.js';
import { type HasDisplayName, type RefProp } from '../../utils/render.js';
declare let DEFAULT_BUTTON_TAG: "button";
type ButtonRenderPropArg = {
    disabled: boolean;
    hover: boolean;
    focus: boolean;
    active: boolean;
    autofocus: boolean;
};
type ButtonPropsWeControl = never;
export type ButtonProps<TTag extends ElementType = typeof DEFAULT_BUTTON_TAG> = Props<TTag, ButtonRenderPropArg, ButtonPropsWeControl, {
    disabled?: boolean;
    autoFocus?: boolean;
    type?: 'button' | 'submit' | 'reset';
}>;
declare function ButtonFn<TTag extends ElementType = typeof DEFAULT_BUTTON_TAG>(props: ButtonProps<TTag>, ref: Ref<HTMLElement>): import("react").ReactElement<any, string | import("react").JSXElementConstructor<any>> | null;
export interface _internal_ComponentButton extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_BUTTON_TAG>(props: ButtonProps<TTag> & RefProp<typeof ButtonFn>): JSX.Element;
}
export declare let Button: _internal_ComponentButton;
export {};
