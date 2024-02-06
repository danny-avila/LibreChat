import { Config } from './types';
type CreateConfigSubsequent = (config: Config) => Config;
export declare function extendTailwindMerge(configExtension: Partial<Config> | CreateConfigSubsequent, ...createConfig: CreateConfigSubsequent[]): (...classLists: import("./tw-join").ClassNameValue[]) => string;
export {};
