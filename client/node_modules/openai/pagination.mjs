// File generated from our OpenAPI spec by Stainless.
import { AbstractPage } from "./core.mjs";
/**
 * Note: no pagination actually occurs yet, this is for forwards-compatibility.
 */
export class Page extends AbstractPage {
    constructor(client, response, body, options) {
        super(client, response, body, options);
        this.object = body.object;
        this.data = body.data;
    }
    getPaginatedItems() {
        return this.data;
    }
    // @deprecated Please use `nextPageInfo()` instead
    /**
     * This page represents a response that isn't actually paginated at the API level
     * so there will never be any next page params.
     */
    nextPageParams() {
        return null;
    }
    nextPageInfo() {
        return null;
    }
}
export class CursorPage extends AbstractPage {
    constructor(client, response, body, options) {
        super(client, response, body, options);
        this.data = body.data;
    }
    getPaginatedItems() {
        return this.data;
    }
    // @deprecated Please use `nextPageInfo()` instead
    nextPageParams() {
        const info = this.nextPageInfo();
        if (!info)
            return null;
        if ('params' in info)
            return info.params;
        const params = Object.fromEntries(info.url.searchParams);
        if (!Object.keys(params).length)
            return null;
        return params;
    }
    nextPageInfo() {
        var _a, _b;
        if (!((_a = this.data) === null || _a === void 0 ? void 0 : _a.length)) {
            return null;
        }
        const next = (_b = this.data[this.data.length - 1]) === null || _b === void 0 ? void 0 : _b.id;
        if (!next)
            return null;
        return { params: { after: next } };
    }
}
//# sourceMappingURL=pagination.mjs.map