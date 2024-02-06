type MatcherNode = {
    type: string;
    value?: string;
    nodes?: Array<MatcherNode>;
    dimension?: {
        unit?: string;
    };
    isVariable?: boolean;
};
export declare function matches(a: MatcherNode, b: MatcherNode): boolean;
export {};
