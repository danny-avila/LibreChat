import { Axis } from './types';
export declare const locationCouldBeScrolled: (axis: Axis, node: HTMLElement) => boolean;
export declare const handleScroll: (axis: Axis, endTarget: HTMLElement, event: any, sourceDelta: number, noOverscroll: boolean) => boolean;
