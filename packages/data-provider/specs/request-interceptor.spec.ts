/**
 * @jest-environment jsdom
 */
import axios from 'axios';
import { setTokenHeader } from '../src/headers-helpers';

/**
 * The response interceptor in request.ts registers at import time when
 * `typeof window !== 'undefined'` (jsdom provides window).
 *
 * We use axios's built-in request adapter mock to avoid real HTTP calls,
 * and verify the interceptor's behavior by observing whether a 401 triggers
 * a refresh POST or is immediately rejected.
 */

/** Mock the axios adapter to simulate responses without HTTP */
const mockAdapter = jest.fn();
let originalAdapter: typeof axios.defaults.adapter;

beforeAll(async () => {
  originalAdapter = axios.defaults.adapter;
  axios.defaults.adapter = mockAdapter;

  /** Import triggers interceptor registration */
  await import('../src/request');
});

beforeEach(() => {
  mockAdapter.mockReset();
});

afterAll(() => {
  axios.defaults.adapter = originalAdapter;
});

afterEach(() => {
  delete axios.defaults.headers.common['Authorization'];
});

describe('axios 401 interceptor — Authorization header guard', () => {
  it('skips refresh and rejects when Authorization header is cleared', async () => {
    /** Simulate a cleared header (as done by setTokenHeader(undefined) during logout) */
    setTokenHeader(undefined);

    /** Set up adapter: first call returns 401, second would be the refresh */
    mockAdapter.mockRejectedValueOnce({
      response: { status: 401 },
      config: { url: '/api/messages', headers: {} },
    });

    try {
      await axios.get('/api/messages');
    } catch {
      // expected rejection
    }

    /**
     * If the interceptor skipped refresh, only 1 call was made (the original).
     * If it attempted refresh, there would be 2+ calls (original + refresh POST).
     */
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it('attempts refresh when Authorization header is present', async () => {
    setTokenHeader('valid-token');

    /** First call: 401 on the original request */
    mockAdapter.mockRejectedValueOnce({
      response: { status: 401 },
      config: { url: '/api/messages', headers: {}, _retry: false },
    });

    /** Second call: the refresh endpoint succeeds */
    mockAdapter.mockResolvedValueOnce({
      data: { token: 'new-token' },
      status: 200,
      headers: {},
      config: {},
    });

    /** Third call: retried original request succeeds */
    mockAdapter.mockResolvedValueOnce({
      data: { messages: [] },
      status: 200,
      headers: {},
      config: {},
    });

    try {
      await axios.get('/api/messages');
    } catch {
      // may reject depending on exact flow
    }

    /** More than 1 call means the interceptor attempted refresh */
    expect(mockAdapter.mock.calls.length).toBeGreaterThan(1);

    /** Verify the second call targeted the refresh endpoint */
    const refreshCall = mockAdapter.mock.calls[1];
    expect(refreshCall[0].url).toContain('api/auth/refresh');
  });
});
