// File generated from our OpenAPI spec by Stainless.
export class APIResource {
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
//# sourceMappingURL=resource.mjs.map