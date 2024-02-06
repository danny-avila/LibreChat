// File generated from our OpenAPI spec by Stainless.

import type { OpenAI } from './index';

export class APIResource {
  protected client: OpenAI;
  constructor(client: OpenAI) {
    this.client = client;

    this.get = client.get.bind(client);
    this.post = client.post.bind(client);
    this.patch = client.patch.bind(client);
    this.put = client.put.bind(client);
    this.delete = client.delete.bind(client);
    this.getAPIList = client.getAPIList.bind(client);
  }

  protected get: OpenAI['get'];
  protected post: OpenAI['post'];
  protected patch: OpenAI['patch'];
  protected put: OpenAI['put'];
  protected delete: OpenAI['delete'];
  protected getAPIList: OpenAI['getAPIList'];
}
