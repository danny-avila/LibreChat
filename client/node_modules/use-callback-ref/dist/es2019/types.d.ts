import * as React from 'react';
export declare type RefCallback<T> = (newValue: T | null) => void;
export declare type RefObject<T> = React.MutableRefObject<T | null>;
export declare type DefinedReactRef<T> = RefCallback<T> | RefObject<T>;
export declare type ReactRef<T> = DefinedReactRef<T> | null;
