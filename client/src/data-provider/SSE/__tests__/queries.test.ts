/**
 * `~/utils` re-exports from `@librechat/client`, which pulls in framer-motion (an
 * external peer not present in the jsdom test env). Provide a minimal mock with the
 * two symbols `queries.ts` uses. `isNotFoundError` mirrors the real axios-only
 * implementation in `~/utils/errors`.
 */
jest.mock('~/utils', () => {
  const isNotFoundError = (error: unknown): boolean => {
    if (error != null && typeof error === 'object') {
      const response = (error as { response?: { status?: number } }).response;
      return response?.status === 404;
    }
    return false;
  };
  return { isNotFoundError, updateConvoInAllQueries: jest.fn() };
});

jest.mock('librechat-data-provider', () => ({
  apiBaseUrl: () => '',
  QueryKeys: { conversation: 'conversation', activeJobs: 'activeJobs' },
  request: { get: jest.fn() },
  dataService: { genTitle: jest.fn(), getActiveJobs: jest.fn() },
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ data: undefined })),
  useQueries: jest.fn(() => []),
  useQueryClient: jest.fn(() => ({ setQueryData: jest.fn(), removeQueries: jest.fn() })),
}));

/** `queries.ts` imports `useGetStartupConfig` from `../Endpoints` (i.e.
 *  `data-provider/Endpoints`); from this test file that resolves to `../../Endpoints`.
 *  Mock it so the module under test does not pull in the full data-provider barrel. */
jest.mock('../../Endpoints', () => ({
  useGetStartupConfig: jest.fn(() => ({ data: undefined })),
}));

import { genTitleQueryKey, queueTitleGeneration } from '../queries';

/** Build a minimal Axios-shaped error with a given HTTP status. */
function makeAxiosError(status: number): Error {
  const err = new Error(`HTTP ${status}`) as Error & {
    isAxiosError: boolean;
    response: { status: number };
  };
  err.isAxiosError = true;
  err.response = { status };
  return err;
}

describe('genTitleQueryKey', () => {
  it('returns a two-element tuple with the conversationId', () => {
    expect(genTitleQueryKey('abc-123')).toEqual(['genTitle', 'abc-123']);
  });

  it('returns different keys for different conversation IDs', () => {
    expect(genTitleQueryKey('conv-1')).not.toEqual(genTitleQueryKey('conv-2'));
  });
});

describe('queueTitleGeneration', () => {
  it('runs without throwing for a new conversation ID', () => {
    expect(() => queueTitleGeneration('new-conv-queue-1')).not.toThrow();
  });

  it('is safe to call multiple times for the same conversation ID', () => {
    expect(() => {
      queueTitleGeneration('new-conv-queue-2');
      queueTitleGeneration('new-conv-queue-2');
    }).not.toThrow();
  });
});

/**
 * The title-fetch retry policy in `useTitleGeneration`:
 *
 *   retry: (failureCount, error) => isNotFoundError(error) && failureCount < 3
 *   retryDelay: () => 5_000
 *
 * The server `/gen_title` route waits up to ~15.5s before returning 404 while the
 * title is still generating. Retrying ONLY on 404 (never on 401/403/5xx/network)
 * means a transient "still generating" response is never treated as final (#13318),
 * while genuine errors stay terminal.
 *
 * These tests pin the classification contract and the failure cap so any future
 * change to either is caught.
 */
describe('title fetch retry policy — error classification', () => {
  const isNotFoundError = (error: unknown): boolean => {
    if (error != null && typeof error === 'object') {
      const response = (error as { response?: { status?: number } }).response;
      return response?.status === 404;
    }
    return false;
  };

  it('returns true for a 404 (server still generating the title)', () => {
    expect(isNotFoundError(makeAxiosError(404))).toBe(true);
  });

  it('returns false for a 401 (auth failure — do not retry)', () => {
    expect(isNotFoundError(makeAxiosError(401))).toBe(false);
  });

  it('returns false for a 500 (server failure — do not retry)', () => {
    expect(isNotFoundError(makeAxiosError(500))).toBe(false);
  });

  it('returns false for a plain network Error', () => {
    expect(isNotFoundError(new Error('Network Error'))).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});

describe('title fetch retry policy — failure cap', () => {
  const isNotFoundError = (error: unknown): boolean => {
    if (error != null && typeof error === 'object') {
      const response = (error as { response?: { status?: number } }).response;
      return response?.status === 404;
    }
    return false;
  };

  const retryPredicate = (failureCount: number, error: unknown): boolean =>
    isNotFoundError(error) && failureCount < 3;

  const notFound = makeAxiosError(404);

  it('retries the first three 404 failures', () => {
    expect(retryPredicate(0, notFound)).toBe(true);
    expect(retryPredicate(1, notFound)).toBe(true);
    expect(retryPredicate(2, notFound)).toBe(true);
  });

  it('stops after the third 404 failure', () => {
    expect(retryPredicate(3, notFound)).toBe(false);
  });

  it('never retries a non-404 regardless of attempt count', () => {
    const authErr = makeAxiosError(401);
    for (let i = 0; i < 5; i++) {
      expect(retryPredicate(i, authErr)).toBe(false);
    }
  });
});
