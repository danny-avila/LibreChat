import type { ColorData } from '@csstools/css-color-parser';
import type { ComponentValue } from '@csstools/css-parser-algorithms';
import { TokenNode } from '@csstools/css-parser-algorithms';
export type ColorStop = {
    color: ComponentValue;
    colorData: ColorData;
    position: ComponentValue;
};
export declare function interpolateColorsInColorStopsList(colorStops: Array<ColorStop>, colorSpace: TokenNode, hueInterpolationMethod: TokenNode | null, wideGamut?: boolean): Array<ComponentValue> | false;
