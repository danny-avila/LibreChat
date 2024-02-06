export function setupJestCanvasMock(window?: Window): void

export interface CanvasRenderingContext2DEvent {
  /**
   * This is the type of canvas event that occurred.
   */
  type: string;
  /**
   * This is a six element array that contains the current state of the canvas `currentTransform`
   * value.
   */
  transform: [number, number, number, number, number, number];
  /**
   * These are the relevant properties related to this canvas event.
   */
  props: {
    [key: string]: any;
  };
}

declare global {
  interface CanvasRenderingContext2D {
    /**
     * Get all the events associated with this CanvasRenderingContext2D object.
     *
     * This method cannot be used in a production environment, only with `jest` using
     * `jest-canvas-mock` and should only be used for testing.
     *
     * @example
     * expect(ctx.__getEvents()).toMatchSnapshot();
     */
    __getEvents(): CanvasRenderingContext2DEvent[];

    /**
     * Clear all the events associated with this CanvasRenderingContext2D object.
     *
     * This method cannot be used in a production environment, only with `jest` using
     * `jest-canvas-mock` and should only be used for testing.
     *
     * @example
     * ctx.__clearEvents());
     * expect(ctx.__getEvents()).toBe([]);
     */
    __clearEvents(): void;

    /**
     * Get all the successful draw calls associated with this CanvasRenderingContext2D object.
     *
     * This method cannot be used in a production environment, only with `jest` using
     * `jest-canvas-mock` and should only be used for testing.
     *
     * @example
     * expect(ctx.__getDrawCalls()).toMatchSnapshot();
     */
    __getDrawCalls(): CanvasRenderingContext2DEvent[];

    /**
     * Clear all the successful draw calls associated with this CanvasRenderingContext2D object.
     *
     * This method cannot be used in a production environment, only with `jest` using
     * `jest-canvas-mock` and should only be used for testing.
     *
     * @example
     * ctx.__clearDrawCalls());
     * expect(ctx.__getDrawCalls()).toBe([]);
     */
    __clearDrawCalls(): void;

    /**
     * Get the current path associated with this CanvasRenderingContext2D object.
     *
     * This method cannot be used in a production environment, only with `jest` using
     * `jest-canvas-mock` and should only be used for testing.
     *
     * @example
     * expect(ctx.__getPath()).toMatchSnapshot();
     */
    __getPath(): CanvasRenderingContext2DEvent[];

    /**
     * Clears the current path associated with this CanvasRenderingContext2D object.
     *
     * This method cannot be used in a production environment, only with `jest` using
     * `jest-canvas-mock` and should be only used for testing.
     */
    __clearPath(): void;

    /**
     * Obtains the current clipping path.
     *
     * This method cannot be used in a production environment, only with `jest` using
     * `jest-canvas-mock` and should be only used for testing.
     */
    __getClippingRegion(): CanvasRenderingContext2DEvent[];
  }
}
