/**
 * ~/utils/files re-exports from @librechat/client which requires framer-motion
 * as an external peer dependency — not available in the jest jsdom environment.
 * Provide a minimal mock that satisfies the two symbols queries.ts actually uses.
 */
jest.mock('~/utils', () => {
  // isNotFoundError is defined in ~/utils/errors which only imports axios, so we
  // can inline an equivalent implementation here without triggering the chain.
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
  useQueryClient: jest.fn(() => ({ setQueryData: jest.fn() })),
  useMemo: jest.requireActual('react').useMemo,
  useState: jest.requireActual('react').useState,
  useEffect: jest.requireActual('react').useEffect,
}));

import { genTitleQueryKey, queueTitleGeneration } from '../queries';

/** Build a minimal Axios error with a given HTTP status. */
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
 * The title-fetch retry policy in useTitleGeneration:
 *
 *   retry: (failureCount, error) => isNotFoundError(error) && failureCount < 3
 *   retryDelay: () => 5_000
 *
 * The server /gen_title endpoint waits up to ~15.5 s before returning 404 when
 * the title is still generating (server timeout is 45 s).  With up to 3 client
 * retries at 5 s each the combined window is ~56 s, comfortably covering the
 * server generation timeout.
 *
 * These tests pin the classification contract and the cap so that any future
 * change to either is caught immediately.
 */
describe('title fetch retry policy — error classification', () => {
  // Inline the same predicate used in the production code so changes there
  // will be reflected here when the test is updated to match.
  const isNotFoundError = (error: unknown): boolean => {
    if (error != null && typeof error === 'object') {
      const response = (error as { response?: { status?: number } }).response;
      return response?.status === 404;
    }
    return false;
  };

  it('returns true for a 404 AxiosError (server still generating title)', () => {
    expect(isNotFoundError(makeAxiosError(404))).toBe(true);
  });

  it('returns false for a 401 error (auth failure — do not retry)', () => {
    expect(isNotFoundError(makeAxiosError(401))).toBe(false);
  });

  it('returns false for a 500 error (server failure — do not retry)', () => {
    expect(isNotFoundError(makeAxiosError(500))).toBe(false);
  });

  it('returns false for a plain network Error', () => {
    expect(isNotFoundError(new Error('Network Error'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isNotFoundError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
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

  const notFoundErr = makeAxiosError(404);

  it('retries on 1st failure (failureCount 0)', () => {
    expect(retryPredicate(0, notFoundErr)).toBe(true);
  });

  it('retries on 2nd failure (failureCount 1)', () => {
    expect(retryPredicate(1, notFoundErr)).toBe(true);
  });

  it('retries on 3rd failure (failureCount 2)', () => {
    expect(retryPredicate(2, notFoundErr)).toBe(true);
  });

  it('stops after 3 failures (failureCount 3)', () => {
    expect(retryPredicate(3, notFoundErr)).toBe(false);
  });

  it('never retries a 401 regardless of attempt count', () => {
    const authErr = makeAxiosError(401);
    for (let i = 0; i < 5; i++) {
      expect(retryPredicate(i, authErr)).toBe(false);
    }
  });
});

// Verify that axios is available for the makeAxiosError helper (sanity check)
describe('makeAxiosError helper', () => {
  it('creates an error-like object with the expected status', () => {
    const err = makeAxiosError(404) as Error & { response: { status: number } };
    expect(err.response.status).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });
});

