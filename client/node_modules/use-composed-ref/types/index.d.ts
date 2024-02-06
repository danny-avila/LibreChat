import * as React from 'react';
declare type UserRef<T> = ((instance: T | null) => void) | React.RefObject<T> | null | undefined;
declare const useComposedRef: <T extends HTMLElement>(libRef: React.MutableRefObject<T | null>, userRef: UserRef<T>) => (instance: T | null) => void;
export default useComposedRef;
