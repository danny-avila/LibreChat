import { MiddlewareCallback, SideCarMedium, SideCarMediumOptions, SideMedium } from './types';
export declare function createMedium<T>(defaults?: T, middleware?: MiddlewareCallback<T>): Readonly<SideMedium<T>>;
export declare function createSidecarMedium<T = {}>(options?: SideCarMediumOptions): Readonly<SideCarMedium<T>>;
