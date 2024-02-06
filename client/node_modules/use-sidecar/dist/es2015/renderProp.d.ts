import * as React from 'react';
import { SideCarHOC } from './types';
declare type CombinedProps<T extends any[], K> = {
    children: (...prop: T) => any;
} & K;
declare type RenderPropComponent<T extends any[], K> = React.ComponentType<CombinedProps<T, K>>;
export declare function renderCar<T extends any[], K, C = RenderPropComponent<T, K & Partial<SideCarHOC>>>(WrappedComponent: C, defaults: (props: K) => T): (props: CombinedProps<T, K>) => JSX.Element;
export {};
