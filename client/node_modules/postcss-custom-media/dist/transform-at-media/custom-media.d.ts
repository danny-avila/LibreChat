import { MediaQuery } from '@csstools/media-query-list-parser';
export declare function parseCustomMedia(params: string): {
    name: string;
    truthy: Array<MediaQuery>;
    falsy: Array<MediaQuery>;
    dependsOn: Array<[string, string]>;
} | false;
