export declare class MonotonicInterpolant {
    private xs;
    private ys;
    private c1s;
    private c2s;
    private c3s;
    constructor(xs: number[], ys: number[]);
    interpolate(x: number): number;
}
