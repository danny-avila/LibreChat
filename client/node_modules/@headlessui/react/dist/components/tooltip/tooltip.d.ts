import React, { type ElementType, type Ref } from 'react';
import { type AnchorProps } from '../../internal/floating.js';
import type { Props } from '../../types.js';
import { type HasDisplayName, type PropsForFeatures, type RefProp } from '../../utils/render.js';
declare let DEFAULT_TOOLTIP_TAG: React.ExoticComponent<{
    children?: React.ReactNode;
}>;
type TooltipRenderPropArg = {};
type TooltipPropsWeControl = never;
export type TooltipProps<TTag extends ElementType = typeof DEFAULT_TOOLTIP_TAG> = Props<TTag, TooltipRenderPropArg, TooltipPropsWeControl, {
    showDelayMs?: number;
    hideDelayMs?: number;
}>;
declare function TooltipFn<TTag extends ElementType = typeof DEFAULT_TOOLTIP_TAG>(props: TooltipProps<TTag>, ref: Ref<HTMLElement>): React.JSX.Element;
declare let DEFAULT_TRIGGER_TAG: React.ExoticComponent<{
    children?: React.ReactNode;
}>;
type TriggerRenderPropArg = {
    hover: boolean;
    focus: boolean;
    autofocus: boolean;
};
type TriggerPropsWeControl = 'aria-describedby';
export type TooltipTriggerProps<TTag extends ElementType = typeof DEFAULT_TRIGGER_TAG> = Props<TTag, TriggerRenderPropArg, TriggerPropsWeControl, {
    autoFocus?: boolean;
    disabled?: boolean;
}>;
declare function TriggerFn<TTag extends ElementType = typeof DEFAULT_TRIGGER_TAG>(props: TooltipTriggerProps<TTag>, ref: Ref<HTMLElement>): React.ReactElement<any, string | React.JSXElementConstructor<any>> | null;
declare let DEFAULT_PANEL_TAG: import('../description/description.js')._internal_ComponentDescription;
type PanelRenderPropArg = {};
type PanelPropsWeControl = 'role';
declare let PanelRenderFeatures: number;
export type TooltipPanelProps<TTag extends ElementType = typeof DEFAULT_PANEL_TAG> = Props<TTag, PanelRenderPropArg, PanelPropsWeControl, {
    anchor?: AnchorProps;
} & PropsForFeatures<typeof PanelRenderFeatures>>;
declare function PanelFn<TTag extends ElementType = typeof DEFAULT_PANEL_TAG>(props: TooltipPanelProps<TTag>, ref: Ref<HTMLElement>): React.ReactElement<any, string | React.JSXElementConstructor<any>> | null;
export interface _internal_ComponentTooltip extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_TOOLTIP_TAG>(props: TooltipProps<TTag> & RefProp<typeof TooltipFn>): JSX.Element;
}
export interface _internal_ComponentTrigger extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_TRIGGER_TAG>(props: TooltipTriggerProps<TTag> & RefProp<typeof TriggerFn>): JSX.Element;
}
export interface _internal_ComponentPanel extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_PANEL_TAG>(props: TooltipPanelProps<TTag> & RefProp<typeof PanelFn>): JSX.Element;
}
export declare let Tooltip: _internal_ComponentTooltip;
export declare let TooltipTrigger: _internal_ComponentTrigger;
export declare let TooltipPanel: _internal_ComponentPanel;
export {};
