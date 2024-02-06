/// <reference types="react" />
export declare function useElementSize(ref: React.MutableRefObject<HTMLElement | null>, unit?: boolean): {
    width: number;
    height: number;
} | {
    width: string;
    height: string;
};
