export declare type HTML5BackendContext = Window | undefined;
/**
 * Configuration options for the HTML5Backend
 */
export interface HTML5BackendOptions {
    /**
     * The root DOM node to use for subscribing to events. Default=Window
     */
    rootElement: Node;
}
