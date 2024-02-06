import { type ElementType } from 'react';
import type { Props } from '../../types.js';
import { type HasDisplayName } from '../../utils/render.js';
declare let DEFAULT_LEGEND_TAG: import('../label/label.js')._internal_ComponentLabel;
type LegendRenderPropArg = {};
type LegendPropsWeControl = never;
export type LegendProps<TTag extends ElementType = typeof DEFAULT_LEGEND_TAG> = Props<TTag, LegendRenderPropArg, LegendPropsWeControl, {}>;
export interface _internal_ComponentLegend extends HasDisplayName {
    <TTag extends ElementType = typeof DEFAULT_LEGEND_TAG>(props: LegendProps<TTag>): JSX.Element;
}
export declare let Legend: _internal_ComponentLegend;
export {};
