"use strict";
// File generated from our OpenAPI spec by Stainless.
Object.defineProperty(exports, "__esModule", { value: true });
exports.APIResource = void 0;
class APIResource {
    constructor(client) {
        this.client = client;
        this.get = client.get.bind(client);
        this.post = client.post.bind(client);
        this.patch = client.patch.bind(client);
        this.put = client.put.bind(client);
        this.delete = client.delete.bind(client);
        this.getAPIList = client.getAPIList.bind(client);
    }
}
exports.APIResource = APIResource;
//# sourceMappingURL=resource.js.map