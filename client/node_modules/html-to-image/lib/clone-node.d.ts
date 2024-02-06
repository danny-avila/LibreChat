import type { Options } from './types';
export declare function cloneNode<T extends HTMLElement>(node: T, options: Options, isRoot?: boolean): Promise<T | null>;
