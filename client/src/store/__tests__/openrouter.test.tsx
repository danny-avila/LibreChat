import { renderHook, act } from '@testing-library/react';
import { RecoilRoot, useRecoilState, useRecoilValue } from 'recoil';
import React from 'react';
import {
  openRouterModelState,
  openRouterFallbackChainState,
  openRouterAutoRouterEnabledState,
  openRouterConfigSelector,
  openRouterEffectiveFallbackChainSelector,
  isUsingAutoRouterSelector,
} from '../openrouter';

// Helper wrapper for Recoil hooks
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

describe('OpenRouter State Management', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('Atoms', () => {
    test('openRouterModelState defaults to auto router', () => {
      const { result } = renderHook(() => useRecoilValue(openRouterModelState), { wrapper });
      expect(result.current).toBe('openrouter/auto');
    });

    test('openRouterAutoRouterEnabledState defaults to true', () => {
      const { result } = renderHook(() => useRecoilValue(openRouterAutoRouterEnabledState), {
        wrapper,
      });
      expect(result.current).toBe(true);
    });

    test('openRouterFallbackChainState defaults to empty array', () => {
      const { result } = renderHook(() => useRecoilValue(openRouterFallbackChainState), {
        wrapper,
      });
      expect(result.current).toEqual([]);
    });
  });

  describe('openRouterConfigSelector', () => {
    test('returns auto configuration when auto router is enabled', () => {
      const { result } = renderHook(() => useRecoilValue(openRouterConfigSelector), { wrapper });

      expect(result.current).toEqual({
        model: 'openrouter/auto',
        models: [],
        route: 'auto',
        providerPreferences: [],
        maxCreditsPerRequest: undefined,
        includeReasoning: false,
      });
    });

    test('returns fallback configuration when models are specified', () => {
      const { result } = renderHook(
        () => {
          const [, setAutoEnabled] = useRecoilState(openRouterAutoRouterEnabledState);
          const [, setModel] = useRecoilState(openRouterModelState);
          const [, setFallbackChain] = useRecoilState(openRouterFallbackChainState);
          const config = useRecoilValue(openRouterConfigSelector);

          return { setAutoEnabled, setModel, setFallbackChain, config };
        },
        { wrapper },
      );

      act(() => {
        result.current.setAutoEnabled(false);
        result.current.setModel('gpt-4');
        result.current.setFallbackChain(['claude-3-opus', 'gemini-pro']);
      });

      expect(result.current.config).toEqual({
        model: 'gpt-4',
        models: ['claude-3-opus', 'gemini-pro'],
        route: 'fallback',
        providerPreferences: [],
        maxCreditsPerRequest: undefined,
        includeReasoning: false,
      });
    });
  });

  describe('openRouterEffectiveFallbackChainSelector', () => {
    test('returns empty array when auto router is enabled', () => {
      const { result } = renderHook(
        () => useRecoilValue(openRouterEffectiveFallbackChainSelector),
        { wrapper },
      );
      expect(result.current).toEqual([]);
    });

    test('prepends primary model to fallback chain if not included', () => {
      const { result } = renderHook(
        () => {
          const [, setAutoEnabled] = useRecoilState(openRouterAutoRouterEnabledState);
          const [, setModel] = useRecoilState(openRouterModelState);
          const [, setFallbackChain] = useRecoilState(openRouterFallbackChainState);
          const effectiveChain = useRecoilValue(openRouterEffectiveFallbackChainSelector);

          return { setAutoEnabled, setModel, setFallbackChain, effectiveChain };
        },
        { wrapper },
      );

      act(() => {
        result.current.setAutoEnabled(false);
        result.current.setModel('gpt-4');
        result.current.setFallbackChain(['claude-3-opus', 'gemini-pro']);
      });

      expect(result.current.effectiveChain).toEqual(['gpt-4', 'claude-3-opus', 'gemini-pro']);
    });

    test('does not duplicate primary model if already in chain', () => {
      const { result } = renderHook(
        () => {
          const [, setAutoEnabled] = useRecoilState(openRouterAutoRouterEnabledState);
          const [, setModel] = useRecoilState(openRouterModelState);
          const [, setFallbackChain] = useRecoilState(openRouterFallbackChainState);
          const effectiveChain = useRecoilValue(openRouterEffectiveFallbackChainSelector);

          return { setAutoEnabled, setModel, setFallbackChain, effectiveChain };
        },
        { wrapper },
      );

      act(() => {
        result.current.setAutoEnabled(false);
        result.current.setModel('gpt-4');
        result.current.setFallbackChain(['gpt-4', 'claude-3-opus']);
      });

      expect(result.current.effectiveChain).toEqual(['gpt-4', 'claude-3-opus']);
    });
  });

  describe('isUsingAutoRouterSelector', () => {
    test('returns true when auto router is enabled', () => {
      const { result } = renderHook(() => useRecoilValue(isUsingAutoRouterSelector), { wrapper });
      expect(result.current).toBe(true);
    });

    test('returns true when model is openrouter/auto', () => {
      const { result } = renderHook(
        () => {
          const [, setAutoEnabled] = useRecoilState(openRouterAutoRouterEnabledState);
          const [, setModel] = useRecoilState(openRouterModelState);
          const isAutoRouter = useRecoilValue(isUsingAutoRouterSelector);

          return { setAutoEnabled, setModel, isAutoRouter };
        },
        { wrapper },
      );

      act(() => {
        result.current.setAutoEnabled(false);
        result.current.setModel('openrouter/auto');
      });

      expect(result.current.isAutoRouter).toBe(true);
    });

    test('returns false when using specific model', () => {
      const { result } = renderHook(
        () => {
          const [, setAutoEnabled] = useRecoilState(openRouterAutoRouterEnabledState);
          const [, setModel] = useRecoilState(openRouterModelState);
          const isAutoRouter = useRecoilValue(isUsingAutoRouterSelector);

          return { setAutoEnabled, setModel, isAutoRouter };
        },
        { wrapper },
      );

      act(() => {
        result.current.setAutoEnabled(false);
        result.current.setModel('gpt-4');
      });

      expect(result.current.isAutoRouter).toBe(false);
    });
  });

  describe('localStorage persistence', () => {
    test('persists model selection to localStorage', () => {
      const { result } = renderHook(
        () => {
          const [model, setModel] = useRecoilState(openRouterModelState);
          return { model, setModel };
        },
        { wrapper },
      );

      act(() => {
        result.current.setModel('claude-3-opus');
      });

      const stored = localStorage.getItem('openRouterModel');
      expect(JSON.parse(stored!)).toBe('claude-3-opus');
    });

    test('loads persisted values from localStorage', () => {
      // Set value in localStorage before rendering
      localStorage.setItem('openRouterModel', JSON.stringify('gemini-pro'));
      localStorage.setItem('openRouterAutoRouterEnabled', JSON.stringify(false));

      const { result } = renderHook(
        () => ({
          model: useRecoilValue(openRouterModelState),
          autoEnabled: useRecoilValue(openRouterAutoRouterEnabledState),
        }),
        { wrapper },
      );

      expect(result.current.model).toBe('gemini-pro');
      expect(result.current.autoEnabled).toBe(false);
    });
  });
});
