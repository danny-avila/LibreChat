/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { favoritesAtom } from '~/store';
import useFavorites from '../useFavorites';
import type { Favorite } from '~/store/favorites';

const mockMutateAsync = jest.fn();
const mockShowToast = jest.fn();
const mockRefetch = jest.fn();

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/data-provider', () => ({
  useGetFavoritesQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
  }),
  useUpdateFavoritesMutation: () => ({
    mutateAsync: mockMutateAsync,
    isLoading: false,
    error: null,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const renderUseFavorites = (initialFavorites: Favorite[] = []) => {
  const store = createStore();
  store.set(favoritesAtom, initialFavorites);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );
  return { ...renderHook(() => useFavorites(), { wrapper }), store };
};

describe('useFavorites — spec methods', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockShowToast.mockReset();
    mockRefetch.mockReset();
    mockMutateAsync.mockResolvedValue(undefined);
  });

  describe('addFavoriteSpec', () => {
    it('adds a new spec favorite and persists', async () => {
      const { result } = renderUseFavorites([]);
      await act(async () => {
        result.current.addFavoriteSpec('gpt-5-spec');
      });
      expect(mockMutateAsync).toHaveBeenCalledWith([{ spec: 'gpt-5-spec' }]);
      expect(result.current.favorites).toEqual([{ spec: 'gpt-5-spec' }]);
    });

    it('is a no-op when spec is already favorited', async () => {
      const { result } = renderUseFavorites([{ spec: 'gpt-5-spec' }]);
      await act(async () => {
        result.current.addFavoriteSpec('gpt-5-spec');
      });
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('preserves existing agent/model favorites when adding a spec', async () => {
      const existing: Favorite[] = [{ agentId: 'a1' }, { model: 'gpt-5', endpoint: 'openai' }];
      const { result } = renderUseFavorites(existing);
      await act(async () => {
        result.current.addFavoriteSpec('my-spec');
      });
      expect(mockMutateAsync).toHaveBeenCalledWith([
        { agentId: 'a1' },
        { model: 'gpt-5', endpoint: 'openai' },
        { spec: 'my-spec' },
      ]);
    });
  });

  describe('removeFavoriteSpec', () => {
    it('removes an existing spec favorite', async () => {
      const { result } = renderUseFavorites([{ spec: 'keep' }, { spec: 'drop' }]);
      await act(async () => {
        result.current.removeFavoriteSpec('drop');
      });
      expect(mockMutateAsync).toHaveBeenCalledWith([{ spec: 'keep' }]);
    });

    it('still persists when the target spec is absent', async () => {
      const { result } = renderUseFavorites([{ spec: 'keep' }]);
      await act(async () => {
        result.current.removeFavoriteSpec('missing');
      });
      expect(mockMutateAsync).toHaveBeenCalledWith([{ spec: 'keep' }]);
      expect(result.current.favorites).toEqual([{ spec: 'keep' }]);
    });
  });

  describe('isFavoriteSpec', () => {
    it('returns false for undefined / null / empty string', () => {
      const { result } = renderUseFavorites([{ spec: 'x' }]);
      expect(result.current.isFavoriteSpec(undefined)).toBe(false);
      expect(result.current.isFavoriteSpec(null)).toBe(false);
      expect(result.current.isFavoriteSpec('')).toBe(false);
    });

    it('returns true when spec is present', () => {
      const { result } = renderUseFavorites([{ spec: 'x' }]);
      expect(result.current.isFavoriteSpec('x')).toBe(true);
    });

    it('returns false when spec is not present', () => {
      const { result } = renderUseFavorites([{ spec: 'x' }]);
      expect(result.current.isFavoriteSpec('y')).toBe(false);
    });
  });

  describe('toggleFavoriteSpec', () => {
    it('adds when absent', async () => {
      const { result } = renderUseFavorites([]);
      await act(async () => {
        result.current.toggleFavoriteSpec('new');
      });
      expect(mockMutateAsync).toHaveBeenCalledWith([{ spec: 'new' }]);
    });

    it('removes when present', async () => {
      const { result } = renderUseFavorites([{ spec: 'new' }]);
      await act(async () => {
        result.current.toggleFavoriteSpec('new');
      });
      expect(mockMutateAsync).toHaveBeenCalledWith([]);
    });
  });

  describe('cleanFavorites (via saveFavorites)', () => {
    it('filters out entries with no canonical shape', async () => {
      const { result } = renderUseFavorites([]);
      await act(async () => {
        result.current.reorderFavorites(
          [
            { agentId: 'a1' },
            {} as Favorite, // stripped
            { spec: 's1' },
            { model: 'm', endpoint: 'e' },
          ],
          true,
        );
      });
      expect(mockMutateAsync).toHaveBeenCalledWith([
        { agentId: 'a1' },
        { spec: 's1' },
        { model: 'm', endpoint: 'e' },
      ]);
    });

    it('collapses mixed-shape entry to the first-matching canonical variant', async () => {
      const { result } = renderUseFavorites([]);
      await act(async () => {
        result.current.reorderFavorites(
          [
            // agentId takes priority in cleanFavorites
            { agentId: 'a1', spec: 'ignored' } as Favorite,
          ],
          true,
        );
      });
      expect(mockMutateAsync).toHaveBeenCalledWith([{ agentId: 'a1' }]);
    });
  });
});
