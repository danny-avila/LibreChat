import { type ElementType, type Ref } from 'react';
import type { Props } from '../../types.js';
import { type HasDisplayName, type RefProp } from '../../utils/render.js';
declare let DEFAULT_TEXTAREA_TAG: "textarea";
type TextareaRenderPropArg = {
    disabled: boolean;
    hover: boolean;
    focus: boolean;
    autofocus: boolean;
    invalid: boolean;
};
type TextareaPropsWeControl = 'aria-labelledby' | 'aria-describedby';
export type TextareaProps<TTag extends ElementType = typeof DEFAULT_TEXTAREA_TAG> = Props<TTag, TextareaRenderPropArg, TextareaPropsWeControl, {
    disabled?: boolean;
    invalid?: boolean;
    autoFocus?: boolean;
}>;
declare function TextareaFn<TTag extends ElementType = typeof DEFAULT_TEXTAREA_TAG>(props: TextareaProps<TTag>, ref: Ref<HTMLElement>): import("react").ReactElement<any, string | import("react").JSXElementConstructor<any>> | null;
export interface _internal_ComponentTextarea extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_TEXTAREA_TAG>(props: TextareaProps<TTag> & RefProp<typeof TextareaFn>): JSX.Element;
}
export declare let Textarea: _internal_ComponentTextarea;
export {};
