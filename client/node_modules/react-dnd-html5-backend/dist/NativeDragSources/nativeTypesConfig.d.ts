export interface NativeItemConfigExposePropreties {
    [property: string]: (dataTransfer: DataTransfer, matchesTypes: string[]) => any;
}
export interface NativeItemConfig {
    exposeProperties: NativeItemConfigExposePropreties;
    matchesTypes: string[];
}
export declare const nativeTypesConfig: {
    [key: string]: NativeItemConfig;
};
