import '~/admin/test/fetch';
import { getDefaultStore } from 'jotai';
import { request, ADMIN_SCOPE_HEADER, ADMIN_PLATFORM_SCOPE } from 'librechat-data-provider';
import { apiFetch, platformFetch } from '../api';
import { adminScopeAtom } from '~/admin/store';

/** jsdom has no Headers; the request layer only sets and reads a few. */
class TestHeaders {
  private readonly values = new Map<string, string>();

  constructor(init?: HeadersInit | TestHeaders) {
    const entries =
      init instanceof TestHeaders
        ? init.values.entries()
        : Object.entries((init ?? {}) as Record<string, string>);
    for (const [name, value] of entries) {
      this.values.set(name.toLowerCase(), value);
    }
  }

  get(name: string) {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  has(name: string) {
    return this.values.has(name.toLowerCase());
  }

  set(name: string, value: string) {
    this.values.set(name.toLowerCase(), value);
  }
}

const sent = jest.fn();

beforeEach(() => {
  Object.assign(globalThis, { Headers: TestHeaders });
  sent.mockReset();
  jest.spyOn(request, 'authenticatedFetch').mockImplementation(async (url, init) => {
    sent(url, init);
    return new Response('{}', { status: 200 });
  });
});

function header(): string | null {
  const init = sent.mock.calls[0][1] as RequestInit;
  return (init.headers as unknown as TestHeaders).get(ADMIN_SCOPE_HEADER);
}

describe('admin requests', () => {
  it('name the scope the panel acts in', async () => {
    getDefaultStore().set(adminScopeAtom, 'org_acme');
    await apiFetch('/api/admin/roles');
    expect(header()).toBe('org_acme');
  });

  it('ask about the platform itself at the platform, whatever the scope', async () => {
    getDefaultStore().set(adminScopeAtom, 'org_acme');
    await platformFetch('/api/admin/organizations');
    expect(header()).toBe(ADMIN_PLATFORM_SCOPE);
  });

  it('keep a scope the caller named', async () => {
    getDefaultStore().set(adminScopeAtom, 'org_acme');
    await apiFetch('/api/admin/roles', { headers: { [ADMIN_SCOPE_HEADER]: 'org_other' } });
    expect(header()).toBe('org_other');
  });
});
