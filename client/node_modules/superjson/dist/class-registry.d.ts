import { Registry } from './registry';
import { Class } from './types';
export interface RegisterOptions {
    identifier?: string;
    allowProps?: string[];
}
export declare class ClassRegistry extends Registry<Class> {
    constructor();
    private classToAllowedProps;
    register(value: Class, options?: string | RegisterOptions): void;
    getAllowedProps(value: Class): string[] | undefined;
}
