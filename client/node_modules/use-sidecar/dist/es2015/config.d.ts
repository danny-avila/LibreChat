export interface IConfig {
    onError(e: Error): void;
}
export declare const config: IConfig;
export declare const setConfig: (conf: Partial<IConfig>) => void;
