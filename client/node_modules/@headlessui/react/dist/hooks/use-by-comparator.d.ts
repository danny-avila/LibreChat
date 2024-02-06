export type ByComparator<T> = (T extends null ? string : keyof T & string) | ((a: T, z: T) => boolean);
export declare function useByComparator<T>(by?: ByComparator<T>): (a: T, z: T) => boolean;
