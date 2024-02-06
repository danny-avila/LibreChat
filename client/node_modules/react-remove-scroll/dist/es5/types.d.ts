import * as React from 'react';
import { Ref, RefObject } from 'react';
import { ForwardRefExoticComponent } from 'react';
import { RefAttributes } from 'react';
export declare type Axis = 'v' | 'h';
export interface RemoveScrollEffectCallbacks {
    onScrollCapture(event: any): void;
    onWheelCapture(event: any): void;
    onTouchMoveCapture(event: any): void;
}
export interface ChildrenNode {
    /**
     * if forwardProps is false - children should be ReactNode
     * and it would be wrapper with a div
     * @see {@link IRemoveScrollSelfProps.as}
     */
    forwardProps?: false;
    children: React.ReactNode;
}
export interface ChildrenForward {
    /**
     * if forwardProps is true - children should be single Element
     * which would NOT with a div
     * @see {@link IRemoveScrollSelfProps.as}
     */
    forwardProps: true;
    children: React.ReactElement;
}
export interface IRemoveScrollSelfProps {
    ref?: Ref<HTMLElement>;
    /**
     * disables "event isolation" (suppressing of events happening outside of the Lock)
     * @default false
     */
    noIsolation?: boolean;
    /**
     * enabled complete Lock isolation using `pointer-events:none` for anything outside the Lock
     * you probably don't need it, except you do
     * @default false
     * @see {IRemoveScrollSelfProps.noIsolation}
     */
    inert?: boolean;
    /**
     * allows pinch-zoom, however might work not perfectly for normal scroll
     */
    allowPinchZoom?: boolean;
    /**
     * switches on/off the behavior of the component
     */
    enabled?: boolean;
    /**
     * Controls the body scroll bar removal
     * @default false
     */
    removeScrollBar?: boolean;
    className?: string;
    style?: React.CSSProperties;
    /**
     * array of refs to other Elements, which should be considered as a part of the Lock
     */
    shards?: Array<React.RefObject<any> | HTMLElement>;
    /**
     * Control host node used for the lock.
     * @default 'div'
     */
    as?: string | React.ElementType;
}
export declare type IRemoveScrollProps = IRemoveScrollSelfProps & (ChildrenForward | ChildrenNode);
export declare type IRemoveScrollUIProps = IRemoveScrollProps & {
    sideCar: React.FC<any>;
};
export interface IRemoveScrollEffectProps {
    noIsolation?: boolean;
    removeScrollBar?: boolean;
    allowPinchZoom: boolean;
    inert?: boolean;
    shards?: Array<React.RefObject<any> | HTMLElement>;
    lockRef: RefObject<HTMLElement>;
    setCallbacks(cb: RemoveScrollEffectCallbacks): void;
}
interface WithClassNames {
    classNames: {
        fullWidth: string;
        zeroRight: string;
    };
}
declare type RefForwarded<T> = ForwardRefExoticComponent<T & RefAttributes<HTMLElement>> & WithClassNames;
export declare type RemoveScrollType = RefForwarded<IRemoveScrollProps>;
export declare type RemoveScrollUIType = RefForwarded<IRemoveScrollUIProps>;
export {};
