/** String.prototype.isWellFormed — ES2024 API, available in Node 20+ but absent from TS 5.3 lib */
interface String {
  isWellFormed(): boolean;
}

declare module 'supertest' {
  import type { Express } from 'express';

  interface SuperTestResponse {
    text: string;
  }

  interface SuperTestRequest extends Promise<SuperTestResponse> {
    attach(field: string, file: Uint8Array, filename?: string): this;
    expect(status: number): this;
    send(body: Uint8Array | object | string): this;
    set(field: string, value: string): this;
  }

  interface SuperTest {
    delete(url: string): SuperTestRequest;
    get(url: string): SuperTestRequest;
    post(url: string): SuperTestRequest;
  }

  export default function request(app: Express): SuperTest;
}
