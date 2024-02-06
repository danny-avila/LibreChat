export declare abstract class Removable {
    cacheTime: number;
    private gcTimeout?;
    destroy(): void;
    protected scheduleGc(): void;
    protected updateCacheTime(newCacheTime: number | undefined): void;
    protected clearGcTimeout(): void;
    protected abstract optionalRemove(): void;
}
//# sourceMappingURL=removable.d.ts.map