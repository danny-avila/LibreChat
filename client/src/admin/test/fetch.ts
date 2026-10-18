/**
 * jsdom has no fetch primitives, and a few panel tests build responses with headers and a body
 * that is passed on. Importing this module installs a small stand-in for those tests only.
 */
type HeadersInit = Record<string, string>;

class TestHeaders {
  private readonly values = new Map<string, string>();

  constructor(init: HeadersInit = {}) {
    for (const [name, value] of Object.entries(init)) {
      this.values.set(name.toLowerCase(), value);
    }
  }

  get(name: string): string | null {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  has(name: string): boolean {
    return this.values.has(name.toLowerCase());
  }

  set(name: string, value: string): void {
    this.values.set(name.toLowerCase(), value);
  }
}

class TestResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: TestHeaders;
  /** The raw body, so a response built from another one's `body` keeps it. */
  readonly body: string | null;

  constructor(body: string | null = null, init: { status?: number; headers?: HeadersInit } = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new TestHeaders(init.headers);
  }

  async text(): Promise<string> {
    return this.body ?? '';
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
}

if (typeof globalThis.Response === 'undefined') {
  Object.assign(globalThis, { Headers: TestHeaders, Response: TestResponse });
}

export {};
