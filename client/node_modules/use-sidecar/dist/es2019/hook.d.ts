import { Importer, SideMedium } from './types';
export declare function useSidecar<T>(importer: Importer<T>, effect?: SideMedium<any>): [React.ComponentType<T> | null, Error | null];
