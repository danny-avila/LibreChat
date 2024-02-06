import { ClassGroupId, ClassValidator, Config } from './types';
export interface ClassPartObject {
    nextPart: Map<string, ClassPartObject>;
    validators: ClassValidatorObject[];
    classGroupId?: ClassGroupId;
}
interface ClassValidatorObject {
    classGroupId: ClassGroupId;
    validator: ClassValidator;
}
export declare function createClassUtils(config: Config): {
    getClassGroupId: (className: string) => string | undefined;
    getConflictingClassGroupIds: (classGroupId: ClassGroupId, hasPostfixModifier: boolean) => readonly string[];
};
/**
 * Exported for testing only
 */
export declare function createClassMap(config: Config): ClassPartObject;
export {};
