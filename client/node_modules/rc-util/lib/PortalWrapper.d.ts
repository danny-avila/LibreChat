import * as React from 'react';
import { PortalRef } from './Portal';
import ScrollLocker from './Dom/scrollLocker';
/** @private Test usage only */
export declare function getOpenCount(): number;
export type GetContainer = string | HTMLElement | (() => HTMLElement);
export interface PortalWrapperProps {
    visible?: boolean;
    getContainer?: GetContainer;
    wrapperClassName?: string;
    forceRender?: boolean;
    children: (info: {
        getOpenCount: () => number;
        getContainer: () => HTMLElement;
        switchScrollingEffect: () => void;
        scrollLocker: ScrollLocker;
        ref?: (c: any) => void;
    }) => React.ReactNode;
}
declare class PortalWrapper extends React.Component<PortalWrapperProps> {
    container?: HTMLElement;
    componentRef: React.RefObject<PortalRef>;
    rafId?: number;
    scrollLocker: ScrollLocker;
    constructor(props: PortalWrapperProps);
    renderComponent?: (info: {
        afterClose: Function;
        onClose: Function;
        visible: boolean;
    }) => void;
    componentDidMount(): void;
    componentDidUpdate(prevProps: PortalWrapperProps): void;
    updateScrollLocker: (prevProps?: Partial<PortalWrapperProps>) => void;
    updateOpenCount: (prevProps?: Partial<PortalWrapperProps>) => void;
    componentWillUnmount(): void;
    attachToParent: (force?: boolean) => boolean;
    getContainer: () => HTMLElement;
    setWrapperClassName: () => void;
    removeCurrentContainer: () => void;
    /**
     * Enhance ./switchScrollingEffect
     * 1. Simulate document body scroll bar with
     * 2. Record body has overflow style and recover when all of PortalWrapper invisible
     * 3. Disable body scroll when PortalWrapper has open
     *
     * @memberof PortalWrapper
     */
    switchScrollingEffect: () => void;
    render(): any;
}
export default PortalWrapper;
