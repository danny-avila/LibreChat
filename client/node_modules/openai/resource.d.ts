import type { OpenAI } from "./index.js";
export declare class APIResource {
    protected client: OpenAI;
    constructor(client: OpenAI);
    protected get: OpenAI['get'];
    protected post: OpenAI['post'];
    protected patch: OpenAI['patch'];
    protected put: OpenAI['put'];
    protected delete: OpenAI['delete'];
    protected getAPIList: OpenAI['getAPIList'];
}
//# sourceMappingURL=resource.d.ts.map