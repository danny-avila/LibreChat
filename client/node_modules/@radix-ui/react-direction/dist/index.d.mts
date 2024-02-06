import * as React from "react";
type Direction = 'ltr' | 'rtl';
interface DirectionProviderProps {
    children?: React.ReactNode;
    dir: Direction;
}
export const DirectionProvider: React.FC<DirectionProviderProps>;
export function useDirection(localDir?: Direction): Direction;
export const Provider: React.FC<DirectionProviderProps>;

//# sourceMappingURL=index.d.ts.map
