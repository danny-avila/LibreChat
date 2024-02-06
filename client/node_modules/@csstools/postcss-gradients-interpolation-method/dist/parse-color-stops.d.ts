import type { ColorStop } from './color-stop-list';
import type { ComponentValue } from '@csstools/css-parser-algorithms';
export declare function parseColorStops(componentValues: Array<ComponentValue>): Array<ColorStop> | false;
