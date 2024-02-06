import { type ElementType, type Ref } from 'react';
import type { Props } from '../../types.js';
import { type HasDisplayName, type RefProp } from '../../utils/render.js';
declare let DEFAULT_DATA_INTERACTIVE_TAG: import("react").ExoticComponent<{
    children?: import("react").ReactNode;
}>;
type DataInteractiveRenderPropArg = {
    hover: boolean;
    focus: boolean;
    active: boolean;
};
type DataInteractivePropsWeControl = never;
export type DataInteractiveProps<TTag extends ElementType = typeof DEFAULT_DATA_INTERACTIVE_TAG> = Props<TTag, DataInteractiveRenderPropArg, DataInteractivePropsWeControl, {}>;
declare function DataInteractiveFn<TTag extends ElementType = typeof DEFAULT_DATA_INTERACTIVE_TAG>(props: DataInteractiveProps<TTag>, ref: Ref<HTMLElement>): import("react").ReactElement<any, string | import("react").JSXElementConstructor<any>> | null;
export interface _internal_ComponentDataInteractive extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_DATA_INTERACTIVE_TAG>(props: DataInteractiveProps<TTag> & RefProp<typeof DataInteractiveFn>): JSX.Element;
}
export declare let DataInteractive: _internal_ComponentDataInteractive;
export {};
