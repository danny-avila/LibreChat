import { ClassNameValue } from './tw-join';
import { Config } from './types';
type CreateConfigFirst = () => Config;
type CreateConfigSubsequent = (config: Config) => Config;
type TailwindMerge = (...classLists: ClassNameValue[]) => string;
export declare function createTailwindMerge(...createConfig: [CreateConfigFirst, ...CreateConfigSubsequent[]]): TailwindMerge;
export {};
