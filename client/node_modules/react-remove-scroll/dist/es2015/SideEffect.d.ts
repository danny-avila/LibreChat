import { TouchEvent } from 'react';
import { IRemoveScrollEffectProps } from './types';
export declare const getTouchXY: (event: TouchEvent | WheelEvent) => number[];
export declare const getDeltaXY: (event: WheelEvent) => number[];
export declare function RemoveScrollSideCar(props: IRemoveScrollEffectProps): JSX.Element;
