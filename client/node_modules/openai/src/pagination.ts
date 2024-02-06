// File generated from our OpenAPI spec by Stainless.

import { AbstractPage, Response, APIClient, FinalRequestOptions, PageInfo } from './core';

export interface PageResponse<Item> {
  data: Array<Item>;

  object: string;
}

/**
 * Note: no pagination actually occurs yet, this is for forwards-compatibility.
 */
export class Page<Item> extends AbstractPage<Item> implements PageResponse<Item> {
  object: string;

  data: Array<Item>;

  constructor(client: APIClient, response: Response, body: PageResponse<Item>, options: FinalRequestOptions) {
    super(client, response, body, options);

    this.object = body.object;
    this.data = body.data;
  }

  getPaginatedItems(): Item[] {
    return this.data;
  }

  // @deprecated Please use `nextPageInfo()` instead
  /**
   * This page represents a response that isn't actually paginated at the API level
   * so there will never be any next page params.
   */
  nextPageParams(): null {
    return null;
  }

  nextPageInfo(): null {
    return null;
  }
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

export class CursorPage<Item extends { id: string }>
  extends AbstractPage<Item>
  implements CursorPageResponse<Item>
{
  data: Array<Item>;

  constructor(
    client: APIClient,
    response: Response,
    body: CursorPageResponse<Item>,
    options: FinalRequestOptions,
  ) {
    super(client, response, body, options);

    this.data = body.data;
  }

  getPaginatedItems(): Item[] {
    return this.data;
  }

  // @deprecated Please use `nextPageInfo()` instead
  nextPageParams(): Partial<CursorPageParams> | null {
    const info = this.nextPageInfo();
    if (!info) return null;
    if ('params' in info) return info.params;
    const params = Object.fromEntries(info.url.searchParams);
    if (!Object.keys(params).length) return null;
    return params;
  }

  nextPageInfo(): PageInfo | null {
    if (!this.data?.length) {
      return null;
    }

    const next = this.data[this.data.length - 1]?.id;
    if (!next) return null;
    return { params: { after: next } };
  }
}
