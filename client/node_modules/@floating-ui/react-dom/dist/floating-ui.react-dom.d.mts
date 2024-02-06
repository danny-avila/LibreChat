import { AlignedPlacement } from '@floating-ui/dom';
import { Alignment } from '@floating-ui/dom';
import { autoPlacement } from '@floating-ui/dom';
import { AutoPlacementOptions } from '@floating-ui/dom';
import { autoUpdate } from '@floating-ui/dom';
import { AutoUpdateOptions } from '@floating-ui/dom';
import { Axis } from '@floating-ui/dom';
import { Boundary } from '@floating-ui/dom';
import { ClientRectObject } from '@floating-ui/dom';
import { computePosition } from '@floating-ui/dom';
import { ComputePositionConfig } from '@floating-ui/dom';
import { ComputePositionReturn } from '@floating-ui/dom';
import { Coords } from '@floating-ui/dom';
import type { Derivable } from '@floating-ui/dom';
import { detectOverflow } from '@floating-ui/dom';
import { DetectOverflowOptions } from '@floating-ui/dom';
import { Dimensions } from '@floating-ui/dom';
import { ElementContext } from '@floating-ui/dom';
import { ElementRects } from '@floating-ui/dom';
import { Elements } from '@floating-ui/dom';
import { flip } from '@floating-ui/dom';
import { FlipOptions } from '@floating-ui/dom';
import { FloatingElement } from '@floating-ui/dom';
import { getOverflowAncestors } from '@floating-ui/dom';
import { hide } from '@floating-ui/dom';
import { HideOptions } from '@floating-ui/dom';
import { inline } from '@floating-ui/dom';
import { InlineOptions } from '@floating-ui/dom';
import { Length } from '@floating-ui/dom';
import { limitShift } from '@floating-ui/dom';
import { Middleware } from '@floating-ui/dom';
import { MiddlewareArguments } from '@floating-ui/dom';
import { MiddlewareData } from '@floating-ui/dom';
import { MiddlewareReturn } from '@floating-ui/dom';
import { MiddlewareState } from '@floating-ui/dom';
import { NodeScroll } from '@floating-ui/dom';
import { offset } from '@floating-ui/dom';
import { OffsetOptions } from '@floating-ui/dom';
import { Padding } from '@floating-ui/dom';
import { Placement } from '@floating-ui/dom';
import { Platform } from '@floating-ui/dom';
import { platform } from '@floating-ui/dom';
import type * as React_2 from 'react';
import { Rect } from '@floating-ui/dom';
import { ReferenceElement } from '@floating-ui/dom';
import { RootBoundary } from '@floating-ui/dom';
import { shift } from '@floating-ui/dom';
import { ShiftOptions } from '@floating-ui/dom';
import { Side } from '@floating-ui/dom';
import { SideObject } from '@floating-ui/dom';
import { size } from '@floating-ui/dom';
import { SizeOptions } from '@floating-ui/dom';
import { Strategy } from '@floating-ui/dom';
import { VirtualElement } from '@floating-ui/dom';

export { AlignedPlacement }

export { Alignment }

/**
 * Provides data to position an inner element of the floating element so that it
 * appears centered to the reference element.
 * This wraps the core `arrow` middleware to allow React refs as the element.
 * @see https://floating-ui.com/docs/arrow
 */
export declare const arrow: (options: ArrowOptions | Derivable<ArrowOptions>) => Middleware;

export declare interface ArrowOptions {
    /**
     * The arrow element to be positioned.
     * @default undefined
     */
    element: React_2.MutableRefObject<Element | null> | Element | null;
    /**
     * The padding between the arrow element and the floating element edges.
     * Useful when the floating element has rounded corners.
     * @default 0
     */
    padding?: Padding;
}

export { autoPlacement }

export { AutoPlacementOptions }

export { autoUpdate }

export { AutoUpdateOptions }

export { Axis }

export { Boundary }

export { ClientRectObject }

export { computePosition }

export { ComputePositionConfig }

export { ComputePositionReturn }

export { Coords }

export { detectOverflow }

export { DetectOverflowOptions }

export { Dimensions }

export { ElementContext }

export { ElementRects }

export { Elements }

export { flip }

export { FlipOptions }

export { FloatingElement }

export { getOverflowAncestors }

export { hide }

export { HideOptions }

export { inline }

export { InlineOptions }

export { Length }

export { limitShift }

export { Middleware }

export { MiddlewareArguments }

export { MiddlewareData }

export { MiddlewareReturn }

export { MiddlewareState }

export { NodeScroll }

export { offset }

export { OffsetOptions }

export { Padding }

export { Placement }

export { Platform }

export { platform }

declare type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

export { Rect }

export { ReferenceElement }

export declare type ReferenceType = Element | VirtualElement;

export { RootBoundary }

export { shift }

export { ShiftOptions }

export { Side }

export { SideObject }

export { size }

export { SizeOptions }

export { Strategy }

/**
 * Provides data to position a floating element.
 * @see https://floating-ui.com/docs/useFloating
 */
export declare function useFloating<RT extends ReferenceType = ReferenceType>(options?: UseFloatingOptions): UseFloatingReturn<RT>;

export declare type UseFloatingData = Prettify<ComputePositionReturn & {
    isPositioned: boolean;
}>;

export declare type UseFloatingOptions<RT extends ReferenceType = ReferenceType> = Prettify<Partial<ComputePositionConfig> & {
    /**
     * A callback invoked when both the reference and floating elements are
     * mounted, and cleaned up when either is unmounted. This is useful for
     * setting up event listeners (e.g. pass `autoUpdate`).
     */
    whileElementsMounted?: (reference: RT, floating: HTMLElement, update: () => void) => () => void;
    elements?: {
        reference?: RT | null;
        floating?: HTMLElement | null;
    };
    /**
     * The `open` state of the floating element to synchronize with the
     * `isPositioned` value.
     */
    open?: boolean;
    /**
     * Whether to use `transform` for positioning instead of `top` and `left`
     * (layout) in the `floatingStyles` object.
     */
    transform?: boolean;
}>;

export declare type UseFloatingReturn<RT extends ReferenceType = ReferenceType> = Prettify<UseFloatingData & {
    /**
     * Update the position of the floating element, re-rendering the component
     * if required.
     */
    update: () => void;
    /**
     * Pre-configured positioning styles to apply to the floating element.
     */
    floatingStyles: React_2.CSSProperties;
    /**
     * Object containing the reference and floating refs and reactive setters.
     */
    refs: {
        /**
         * A React ref to the reference element.
         */
        reference: React_2.MutableRefObject<RT | null>;
        /**
         * A React ref to the floating element.
         */
        floating: React_2.MutableRefObject<HTMLElement | null>;
        /**
         * A callback to set the reference element (reactive).
         */
        setReference: (node: RT | null) => void;
        /**
         * A callback to set the floating element (reactive).
         */
        setFloating: (node: HTMLElement | null) => void;
    };
    elements: {
        reference: RT | null;
        floating: HTMLElement | null;
    };
}>;

export { VirtualElement }

export { }
