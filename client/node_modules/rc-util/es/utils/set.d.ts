export type Path = (string | number | symbol)[];
export default function set<Entity = any, Output = Entity, Value = any>(entity: Entity, paths: Path, value: Value, removeIfUndefined?: boolean): Output;
/**
 * Merge objects which will create
 */
export declare function merge<T extends object>(...sources: T[]): T;
