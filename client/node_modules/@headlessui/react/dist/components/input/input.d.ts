import { type ElementType, type Ref } from 'react';
import type { Props } from '../../types.js';
import { type HasDisplayName, type RefProp } from '../../utils/render.js';
declare let DEFAULT_INPUT_TAG: "input";
type InputRenderPropArg = {
    disabled: boolean;
    hover: boolean;
    focus: boolean;
    autofocus: boolean;
    invalid: boolean;
};
type InputPropsWeControl = 'aria-labelledby' | 'aria-describedby';
export type InputProps<TTag extends ElementType = typeof DEFAULT_INPUT_TAG> = Props<TTag, InputRenderPropArg, InputPropsWeControl, {
    disabled?: boolean;
    invalid?: boolean;
    autoFocus?: boolean;
}>;
declare function InputFn<TTag extends ElementType = typeof DEFAULT_INPUT_TAG>(props: InputProps<TTag>, ref: Ref<HTMLElement>): import("react").ReactElement<any, string | import("react").JSXElementConstructor<any>> | null;
export interface _internal_ComponentInput extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_INPUT_TAG>(props: InputProps<TTag> & RefProp<typeof InputFn>): JSX.Element;
}
export declare let Input: _internal_ComponentInput;
export {};
