import type * as React from 'react';
import type { Root } from 'react-dom/client';
declare const MARK = "__rc_react_root__";
type ContainerType = (Element | DocumentFragment) & {
    [MARK]?: Root;
};
/** @private Test usage. Not work in prod */
export declare function _r(node: React.ReactElement, container: ContainerType): void;
export declare function render(node: React.ReactElement, container: ContainerType): void;
/** @private Test usage. Not work in prod */
export declare function _u(container: ContainerType): void;
export declare function unmount(container: ContainerType): Promise<void>;
export {};
