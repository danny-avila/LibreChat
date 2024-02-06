export declare type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
export declare type Expect<T extends true> = T;
//# sourceMappingURL=useQuery.types.test.d.ts.map