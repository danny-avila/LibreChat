import { AlignedPlacement } from '@floating-ui/core';
import { Alignment } from '@floating-ui/core';
import type { ArrowOptions as ArrowOptions_2 } from '@floating-ui/core';
import type { AutoPlacementOptions as AutoPlacementOptions_2 } from '@floating-ui/core';
import { Axis } from '@floating-ui/core';
import { ClientRectObject } from '@floating-ui/core';
import type { ComputePositionConfig as ComputePositionConfig_2 } from '@floating-ui/core';
import { ComputePositionReturn } from '@floating-ui/core';
import { Coords } from '@floating-ui/core';
import type { Derivable as Derivable_2 } from '@floating-ui/core';
import { detectOverflow } from '@floating-ui/core';
import type { DetectOverflowOptions as DetectOverflowOptions_2 } from '@floating-ui/core';
import { Dimensions } from '@floating-ui/core';
import { ElementContext } from '@floating-ui/core';
import { ElementRects } from '@floating-ui/core';
import type { FlipOptions as FlipOptions_2 } from '@floating-ui/core';
import { getOverflowAncestors } from '@floating-ui/utils/dom';
import type { HideOptions as HideOptions_2 } from '@floating-ui/core';
import { InlineOptions } from '@floating-ui/core';
import { Length } from '@floating-ui/core';
import type { LimitShiftOptions } from '@floating-ui/core';
import type { Middleware as Middleware_2 } from '@floating-ui/core';
import { MiddlewareData } from '@floating-ui/core';
import { MiddlewareReturn } from '@floating-ui/core';
import type { MiddlewareState as MiddlewareState_2 } from '@floating-ui/core';
import { offset } from '@floating-ui/core';
import { OffsetOptions } from '@floating-ui/core';
import { Padding } from '@floating-ui/core';
import { Placement } from '@floating-ui/core';
import { Rect } from '@floating-ui/core';
import { RootBoundary } from '@floating-ui/core';
import type { ShiftOptions as ShiftOptions_2 } from '@floating-ui/core';
import { Side } from '@floating-ui/core';
import { SideObject } from '@floating-ui/core';
import type { SizeOptions as SizeOptions_2 } from '@floating-ui/core';
import { Strategy } from '@floating-ui/core';

export { AlignedPlacement }

export { Alignment }

/**
 * Provides data to position an inner element of the floating element so that it
 * appears centered to the reference element.
 * @see https://floating-ui.com/docs/arrow
 */
export declare const arrow: (options: ArrowOptions | Derivable_2<ArrowOptions>) => Middleware;

export declare type ArrowOptions = Prettify<Omit<ArrowOptions_2, 'element'> & {
    element: Element;
}>;

/**
 * Optimizes the visibility of the floating element by choosing the placement
 * that has the most space available automatically, without needing to specify a
 * preferred placement. Alternative to `flip`.
 * @see https://floating-ui.com/docs/autoPlacement
 */
export declare const autoPlacement: (options?: AutoPlacementOptions | Derivable_2<AutoPlacementOptions>) => Middleware;

export declare type AutoPlacementOptions = Prettify<Omit<AutoPlacementOptions_2, 'boundary'> & DetectOverflowOptions>;

/**
 * Automatically updates the position of the floating element when necessary.
 * Should only be called when the floating element is mounted on the DOM or
 * visible on the screen.
 * @returns cleanup function that should be invoked when the floating element is
 * removed from the DOM or hidden from the screen.
 * @see https://floating-ui.com/docs/autoUpdate
 */
export declare function autoUpdate(reference: ReferenceElement, floating: FloatingElement, update: () => void, options?: AutoUpdateOptions): () => void;

export declare type AutoUpdateOptions = Partial<{
    /**
     * Whether to update the position when an overflow ancestor is scrolled.
     * @default true
     */
    ancestorScroll: boolean;
    /**
     * Whether to update the position when an overflow ancestor is resized. This
     * uses the native `resize` event.
     * @default true
     */
    ancestorResize: boolean;
    /**
     * Whether to update the position when either the reference or floating
     * elements resized. This uses a `ResizeObserver`.
     * @default true
     */
    elementResize: boolean;
    /**
     * Whether to update the position when the reference relocated on the screen
     * due to layout shift.
     * @default true
     */
    layoutShift: boolean;
    /**
     * Whether to update on every animation frame if necessary. Only use if you
     * need to update the position in response to an animation using transforms.
     * @default false
     */
    animationFrame: boolean;
}>;

export { Axis }

/**
 * The clipping boundary area of the floating element.
 */
export declare type Boundary = 'clippingAncestors' | Element | Array<Element> | Rect;

export { ClientRectObject }

/**
 * Computes the `x` and `y` coordinates that will place the floating element
 * next to a given reference element.
 */
export declare const computePosition: (reference: ReferenceElement, floating: FloatingElement, options?: Partial<ComputePositionConfig>) => Promise<ComputePositionReturn>;

export declare type ComputePositionConfig = Prettify<Omit<ComputePositionConfig_2, 'middleware' | 'platform'> & {
    /**
     * Array of middleware objects to modify the positioning or provide data for
     * rendering.
     */
    middleware?: Array<Middleware | null | undefined | false>;
    /**
     * Custom or extended platform object.
     */
    platform?: Platform;
}>;

export { ComputePositionReturn }

export { Coords }

export declare type Derivable<T> = (state: MiddlewareState) => T;

export { detectOverflow }

export declare type DetectOverflowOptions = Prettify<Omit<DetectOverflowOptions_2, 'boundary'> & {
    boundary?: Boundary;
}>;

export { Dimensions }

export { ElementContext }

export { ElementRects }

export declare interface Elements {
    reference: ReferenceElement;
    floating: FloatingElement;
}

/**
 * Optimizes the visibility of the floating element by flipping the `placement`
 * in order to keep it in view when the preferred placement(s) will overflow the
 * clipping boundary. Alternative to `autoPlacement`.
 * @see https://floating-ui.com/docs/flip
 */
export declare const flip: (options?: FlipOptions | Derivable_2<FlipOptions>) => Middleware;

export declare type FlipOptions = Prettify<Omit<FlipOptions_2, 'boundary'> & DetectOverflowOptions>;

export declare type FloatingElement = HTMLElement;

export { getOverflowAncestors }

/**
 * Provides data to hide the floating element in applicable situations, such as
 * when it is not in the same clipping context as the reference element.
 * @see https://floating-ui.com/docs/hide
 */
export declare const hide: (options?: HideOptions | Derivable_2<HideOptions>) => Middleware;

export declare type HideOptions = Prettify<Omit<HideOptions_2, 'boundary'> & DetectOverflowOptions>;

/**
 * Provides improved positioning for inline reference elements that can span
 * over multiple lines, such as hyperlinks or range selections.
 * @see https://floating-ui.com/docs/inline
 */
export declare const inline: (options?: InlineOptions | Derivable_2<InlineOptions>) => Middleware;

export { InlineOptions }

export { Length }

/**
 * Built-in `limiter` that will stop `shift()` at a certain point.
 */
export declare const limitShift: (options?: LimitShiftOptions | Derivable_2<LimitShiftOptions>) => {
    options: any;
    fn: (state: MiddlewareState) => Coords;
};

export declare type Middleware = Prettify<Omit<Middleware_2, 'fn'> & {
    fn(state: MiddlewareState): Promisable<MiddlewareReturn>;
}>;

/**
 * @deprecated use `MiddlewareState` instead.
 */
export declare type MiddlewareArguments = MiddlewareState;

export { MiddlewareData }

export { MiddlewareReturn }

export declare type MiddlewareState = Prettify<Omit<MiddlewareState_2, 'elements'> & {
    elements: Elements;
}>;

export declare interface NodeScroll {
    scrollLeft: number;
    scrollTop: number;
}

export { offset }

export { OffsetOptions }

export { Padding }

export { Placement }

export declare interface Platform {
    getElementRects: (args: {
        reference: ReferenceElement;
        floating: FloatingElement;
        strategy: Strategy;
    }) => Promisable<ElementRects>;
    getClippingRect: (args: {
        element: Element;
        boundary: Boundary;
        rootBoundary: RootBoundary;
        strategy: Strategy;
    }) => Promisable<Rect>;
    getDimensions: (element: Element) => Promisable<Dimensions>;
    convertOffsetParentRelativeRectToViewportRelativeRect: (args: {
        elements?: Elements;
        rect: Rect;
        offsetParent: Element;
        strategy: Strategy;
    }) => Promisable<Rect>;
    getOffsetParent: (element: Element, polyfill?: (element: HTMLElement) => Element | null) => Promisable<Element | Window>;
    isElement: (value: unknown) => Promisable<boolean>;
    getDocumentElement: (element: Element) => Promisable<HTMLElement>;
    getClientRects: (element: Element) => Promisable<Array<ClientRectObject>>;
    isRTL: (element: Element) => Promisable<boolean>;
    getScale: (element: HTMLElement) => Promisable<{
        x: number;
        y: number;
    }>;
}

export declare const platform: Platform;

declare type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

declare type Promisable<T> = T | Promise<T>;

export { Rect }

export declare type ReferenceElement = Element | VirtualElement;

export { RootBoundary }

/**
 * Optimizes the visibility of the floating element by shifting it in order to
 * keep it in view when it will overflow the clipping boundary.
 * @see https://floating-ui.com/docs/shift
 */
export declare const shift: (options?: ShiftOptions | Derivable_2<ShiftOptions>) => Middleware;

export declare type ShiftOptions = Prettify<Omit<ShiftOptions_2, 'boundary'> & DetectOverflowOptions>;

export { Side }

export { SideObject }

/**
 * Provides data that allows you to change the size of the floating element —
 * for instance, prevent it from overflowing the clipping boundary or match the
 * width of the reference element.
 * @see https://floating-ui.com/docs/size
 */
export declare const size: (options?: SizeOptions | Derivable_2<SizeOptions>) => Middleware;

export declare type SizeOptions = Prettify<Omit<SizeOptions_2, 'apply' | 'boundary'> & DetectOverflowOptions & {
    /**
     * Function that is called to perform style mutations to the floating element
     * to change its size.
     * @default undefined
     */
    apply?(args: MiddlewareState & {
        availableWidth: number;
        availableHeight: number;
    }): Promisable<void>;
}>;

export { Strategy }

/**
 * Custom positioning reference element.
 * @see https://floating-ui.com/docs/virtual-elements
 */
export declare interface VirtualElement {
    getBoundingClientRect(): ClientRectObject;
    contextElement?: Element;
}

export { }
