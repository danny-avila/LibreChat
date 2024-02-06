declare const wrapperRaf: {
    (callback: () => void, times?: number): number;
    cancel(id: number): void;
    ids(): Map<number, number>;
};
export default wrapperRaf;
