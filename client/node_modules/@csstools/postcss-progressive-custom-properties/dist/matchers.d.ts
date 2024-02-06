export declare const matchers: ({
    supports: string;
    property: string;
    sniff: string;
    matchers: {
        type: string;
        value: string;
        nodes: ({
            type: string;
            value: string;
            isVariable?: undefined;
        } | {
            type: string;
            value?: undefined;
            isVariable?: undefined;
        } | {
            type: string;
            isVariable: boolean;
            value?: undefined;
        })[];
    }[];
} | {
    supports: string;
    property: string;
    sniff: string;
    matchers: {
        type: string;
        value: string;
        dimension: {
            unit: string;
        };
    }[];
})[];
