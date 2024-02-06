export declare type GapMode = 'padding' | 'margin';
export interface GapOffset {
    left: number;
    top: number;
    right: number;
    gap: number;
}
export declare const zeroGap: {
    left: number;
    top: number;
    right: number;
    gap: number;
};
export declare const getGapWidth: (gapMode?: GapMode) => GapOffset;
