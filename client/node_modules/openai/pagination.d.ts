import { AbstractPage, Response, APIClient, FinalRequestOptions, PageInfo } from "./core.js";
export interface PageResponse<Item> {
    data: Array<Item>;
    object: string;
}
/**
 * Note: no pagination actually occurs yet, this is for forwards-compatibility.
 */
export declare class Page<Item> extends AbstractPage<Item> implements PageResponse<Item> {
    object: string;
    data: Array<Item>;
    constructor(client: APIClient, response: Response, body: PageResponse<Item>, options: FinalRequestOptions);
    getPaginatedItems(): Item[];
    /**
     * This page represents a response that isn't actually paginated at the API level
     * so there will never be any next page params.
     */
    nextPageParams(): null;
    nextPageInfo(): null;
}
export interface CursorPageResponse<Item> {
    data: Array<Item>;
}
export interface CursorPageParams {
    /**
     * Identifier for the last job from the previous pagination request.
     */
    after?: string;
    /**
     * Number of fine-tuning jobs to retrieve.
     */
    limit?: number;
}
export declare class CursorPage<Item extends {
    id: string;
}> extends AbstractPage<Item> implements CursorPageResponse<Item> {
    data: Array<Item>;
    constructor(client: APIClient, response: Response, body: CursorPageResponse<Item>, options: FinalRequestOptions);
    getPaginatedItems(): Item[];
    nextPageParams(): Partial<CursorPageParams> | null;
    nextPageInfo(): PageInfo | null;
}
//# sourceMappingURL=pagination.d.ts.map