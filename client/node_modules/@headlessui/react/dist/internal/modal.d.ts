import React, { type ElementType, type MutableRefObject, type Ref } from 'react';
import { FocusTrapFeatures } from '../components/focus-trap/focus-trap.js';
import type { Props } from '../types.js';
import { type HasDisplayName, type PropsForFeatures, type RefProp } from '../utils/render.js';
export declare enum ModalFeatures {
    /** No modal features */
    None = 0,
    /** Make the whole page but the Modal `inert` */
    Inert = 1,
    /** Enable scroll locking to prevent scrolling the rest off the page (the body) */
    ScrollLock = 2,
    /**
     * Enable focus trapping, focus trapping features can be configured via the `focusTrapFeatures`
     * prop
     */
    FocusTrap = 4,
    All = 7
}
declare let DEFAULT_MODAL_TAG: "div";
type ModalRenderPropArg = {};
type ModalPropsWeControl = 'aria-dialog';
declare let ModalRenderFeatures: number;
export type ModalProps<TTag extends ElementType = typeof DEFAULT_MODAL_TAG> = Props<TTag, ModalRenderPropArg, ModalPropsWeControl, PropsForFeatures<typeof ModalRenderFeatures> & {
    enabled?: boolean;
    features?: ModalFeatures;
    focusTrapFeatures?: FocusTrapFeatures;
    initialFocus?: MutableRefObject<HTMLElement | null>;
    role?: 'dialog' | 'alertdialog';
}>;
declare function ModalFn<TTag extends ElementType = typeof DEFAULT_MODAL_TAG>(props: ModalProps<TTag>, ref: Ref<HTMLDivElement>): React.JSX.Element;
export interface _internal_ComponentModal extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_MODAL_TAG>(props: ModalProps<TTag> & RefProp<typeof ModalFn>): JSX.Element;
}
export declare let Modal: _internal_ComponentModal;
export {};
