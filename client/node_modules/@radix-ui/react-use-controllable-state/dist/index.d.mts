import * as React from "react";
type UseControllableStateParams<T> = {
    prop?: T | undefined;
    defaultProp?: T | undefined;
    onChange?: (state: T) => void;
};
export function useControllableState<T>({ prop, defaultProp, onChange, }: UseControllableStateParams<T>): readonly [T | undefined, React.Dispatch<React.SetStateAction<T | undefined>>];

//# sourceMappingURL=index.d.ts.map
