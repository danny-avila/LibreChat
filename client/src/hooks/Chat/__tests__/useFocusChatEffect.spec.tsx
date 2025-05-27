const mockNavigate = jest.fn();
const mockTextAreaRef = { current: { focus: jest.fn() } };
const mockSearchParams = new URLSearchParams();
let mockLog: jest.SpyInstance;

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn(),
  useNavigate: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Import the component under test and its dependencies
import { renderHook } from '@testing-library/react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { logger } from '~/utils';
import useFocusChatEffect from '../useFocusChatEffect';

describe('useFocusChatEffect', () => {
  // Reset mocks before each test
  beforeEach(() => {
    mockLog = jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    (useSearchParams as jest.Mock).mockReturnValue([mockSearchParams]);

    // Mock window.matchMedia
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    // Set default location mock
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/c/new',
      search: '',
      state: { focusChat: true },
    });
  });

  describe('Basic functionality', () => {
    test('should focus textarea when location.state.focusChat is true', () => {
      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockTextAreaRef.current.focus).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/c/new', {
        replace: true,
        state: {},
      });
      expect(mockLog).toHaveBeenCalled();
    });

    test('should not focus textarea when location.state.focusChat is false', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: false },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockTextAreaRef.current.focus).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should not focus textarea when textAreaRef.current is null', () => {
      const nullTextAreaRef = { current: null };

      renderHook(() => useFocusChatEffect(nullTextAreaRef as any));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should not focus textarea on touchscreen devices', () => {
      window.matchMedia = jest.fn().mockImplementation(() => ({
        matches: true, // This indicates a touchscreen
        media: '',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockTextAreaRef.current.focus).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  describe('URL parameter handling with React Router DOM', () => {
    test('should use useSearchParams instead of window.location.search', () => {
      const testSearchParams = new URLSearchParams('agent_id=test_agent&model=gpt-4');
      (useSearchParams as jest.Mock).mockReturnValue([testSearchParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?endpoint=openAI&model=gpt-4o-mini',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new?agent_id=test_agent&model=gpt-4',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    test('should handle empty search params correctly', () => {
      const emptySearchParams = new URLSearchParams();
      (useSearchParams as jest.Mock).mockReturnValue([emptySearchParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?should=be_ignored',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith('/c/new', {
        replace: true,
        state: {},
      });
    });

    test('should build URL correctly with multiple search parameters', () => {
      const multiSearchParams = new URLSearchParams();
      multiSearchParams.set('agent_id', 'agent123');
      multiSearchParams.set('prompt', 'test query');
      multiSearchParams.set('model', 'gpt-4');
      multiSearchParams.set('temperature', '0.7');

      (useSearchParams as jest.Mock).mockReturnValue([multiSearchParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/conversation-123',
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/conversation-123?agent_id=agent123&prompt=test+query&model=gpt-4&temperature=0.7',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    test('should handle special characters in search parameters', () => {
      const specialCharsParams = new URLSearchParams();
      specialCharsParams.set('agent_id', 'agent/with-spaces');
      specialCharsParams.set('prompt', 'test query with @#$%');

      (useSearchParams as jest.Mock).mockReturnValue([specialCharsParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new?agent_id=agent%2Fwith-spaces&prompt=test+query+with+%40%23%24%25',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    test('should update URL when search params change', () => {
      const initialParams = new URLSearchParams('agent_id=initial');
      (useSearchParams as jest.Mock).mockReturnValue([initialParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      const { rerender } = renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith('/c/new?agent_id=initial', {
        replace: true,
        state: {},
      });

      jest.clearAllMocks();

      const updatedParams = new URLSearchParams('agent_id=updated&model=gpt-4');
      (useSearchParams as jest.Mock).mockReturnValue([updatedParams]);

      rerender();

      expect(mockNavigate).toHaveBeenCalledWith('/c/new?agent_id=updated&model=gpt-4', {
        replace: true,
        state: {},
      });
    });

    test('should handle navigation when location.state is null', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: null,
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockTextAreaRef.current.focus).not.toHaveBeenCalled();
    });

    test('should handle navigation when location.state.focusChat is undefined', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { someOtherProp: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockTextAreaRef.current.focus).not.toHaveBeenCalled();
    });
  });

  describe('React Router DOM integration', () => {
    test('should use React Router hooks instead of window.location', () => {
      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(useLocation).toHaveBeenCalled();
      expect(useNavigate).toHaveBeenCalled();
      expect(useSearchParams).toHaveBeenCalled();
    });

    test('should not access window.location.search directly', () => {
      const originalLocation = window.location;
      const mockWindowLocation = {
        ...originalLocation,
        search: '?should=not_be_used',
      };

      Object.defineProperty(window, 'location', {
        value: mockWindowLocation,
        writable: true,
      });

      const testParams = new URLSearchParams('from_react_router=true');
      (useSearchParams as jest.Mock).mockReturnValue([testParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?should=not_be_used',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith('/c/new?from_react_router=true', {
        replace: true,
        state: {},
      });

      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      });
    });
  });

  describe('Edge cases', () => {
    test('should handle undefined textAreaRef gracefully', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(undefined as any));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should handle null textAreaRef.current gracefully', () => {
      const nullRef = { current: null };

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(nullRef as any));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should handle location with undefined pathname', () => {
      const testParams = new URLSearchParams('test=param');
      (useSearchParams as jest.Mock).mockReturnValue([testParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: undefined,
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith('undefined?test=param', {
        replace: true,
        state: {},
      });
    });

    test('should handle location with null pathname', () => {
      const testParams = new URLSearchParams('test=param');
      (useSearchParams as jest.Mock).mockReturnValue([testParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: null,
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith('null?test=param', {
        replace: true,
        state: {},
      });
    });

    test('should handle extremely long URLs correctly', () => {
      const longSearchParams = new URLSearchParams();
      for (let i = 0; i < 100; i++) {
        longSearchParams.set(`param${i}`, `value${i}`.repeat(50));
      }
      (useSearchParams as jest.Mock).mockReturnValue([longSearchParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/very-long-conversation-id-that-exceeds-normal-length',
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/c\/very-long-conversation-id-that-exceeds-normal-length\?/),
        {
          replace: true,
          state: {},
        },
      );
    });

    test('should handle malformed search parameters', () => {
      const malformedParams = new URLSearchParams();
      malformedParams.append('malformed=param=with=equals', '');
      malformedParams.append('another&bad&param', 'value');
      malformedParams.append('=empty-key', 'value');
      (useSearchParams as jest.Mock).mockReturnValue([malformedParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/c/new?'), {
        replace: true,
        state: {},
      });
    });

    test('should handle Unicode and emoji characters in URL parameters', () => {
      const unicodeParams = new URLSearchParams();
      unicodeParams.set('emoji', '🤖💬🚀');
      unicodeParams.set('unicode', 'café niño 北京');
      unicodeParams.set('special', '!@#$%^&*()');
      (useSearchParams as jest.Mock).mockReturnValue([unicodeParams]);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/unicode-test',
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/c\/unicode-test\?/), {
        replace: true,
        state: {},
      });
    });

    test('should handle missing window.matchMedia gracefully', () => {
      const originalMatchMedia = window.matchMedia;
      delete (window as any).matchMedia;

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      expect(() => {
        renderHook(() => useFocusChatEffect(mockTextAreaRef as any));
      }).not.toThrow();

      expect(mockTextAreaRef.current.focus).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalled();

      window.matchMedia = originalMatchMedia;
    });

    test('should handle window.matchMedia throwing an error', () => {
      window.matchMedia = jest.fn().mockImplementation(() => {
        throw new Error('matchMedia not supported');
      });

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      expect(() => {
        renderHook(() => useFocusChatEffect(mockTextAreaRef as any));
      }).toThrow('matchMedia not supported');
    });

    test('should handle focus method throwing an error', () => {
      const throwingRef = {
        current: {
          focus: jest.fn().mockImplementation(() => {
            throw new Error('Focus failed');
          }),
        },
      };

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      expect(() => {
        renderHook(() => useFocusChatEffect(throwingRef as any));
      }).toThrow('Focus failed');
    });

    test('should handle navigate function throwing an error', () => {
      const throwingNavigate = jest.fn().mockImplementation(() => {
        throw new Error('Navigation failed');
      });
      (useNavigate as jest.Mock).mockReturnValue(throwingNavigate);

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      expect(() => {
        renderHook(() => useFocusChatEffect(mockTextAreaRef as any));
      }).toThrow('Navigation failed');
    });

    test('should handle location state with nested objects', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: {
          focusChat: true,
          nested: {
            deep: {
              value: 'test',
            },
          },
          array: [1, 2, 3],
        },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockTextAreaRef.current.focus).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalled();
    });

    test('should handle location state as primitive types', () => {
      const testCases = [{ state: 'string' }, { state: 123 }, { state: true }, { state: false }];

      testCases.forEach((testCase, index) => {
        jest.clearAllMocks();

        (useLocation as jest.Mock).mockReturnValue({
          pathname: `/c/test${index}`,
          search: '',
          state: testCase.state,
        });

        renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(mockTextAreaRef.current.focus).not.toHaveBeenCalled();
      });
    });

    test('should handle rapid successive location changes', () => {
      const locations = [
        { pathname: '/c/1', state: { focusChat: true } },
        { pathname: '/c/2', state: { focusChat: true } },
        { pathname: '/c/3', state: { focusChat: true } },
      ];

      const { rerender } = renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      locations.forEach((location) => {
        jest.clearAllMocks();
        (useLocation as jest.Mock).mockReturnValue({
          ...location,
          search: '',
        });

        rerender();

        expect(mockNavigate).toHaveBeenCalledWith(location.pathname, {
          replace: true,
          state: {},
        });
      });
    });

    test('should handle searchParams returning null or undefined', () => {
      const testCases = [null, undefined];

      testCases.forEach((searchParamsValue, index) => {
        jest.clearAllMocks();
        (useSearchParams as jest.Mock).mockReturnValue([searchParamsValue]);

        (useLocation as jest.Mock).mockReturnValue({
          pathname: `/c/test${index}`,
          search: '',
          state: { focusChat: true },
        });

        renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

        expect(mockNavigate).toHaveBeenCalledWith(`/c/test${index}`, {
          replace: true,
          state: {},
        });
      });
    });

    test('should handle very deep pathname nesting', () => {
      const deepPath = '/c/' + 'nested/'.repeat(50) + 'conversation';

      (useLocation as jest.Mock).mockReturnValue({
        pathname: deepPath,
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(deepPath, {
        replace: true,
        state: {},
      });
    });

    test('should handle empty string pathname', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '',
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith('', {
        replace: true,
        state: {},
      });
    });
  });
});
