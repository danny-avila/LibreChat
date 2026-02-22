const mockNavigate = jest.fn();
const mockTextAreaRef = { current: { focus: jest.fn() } };
let mockLog: jest.SpyInstance;

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn(),
  useNavigate: jest.fn(),
}));

// Import the component under test and its dependencies
import { renderHook } from '@testing-library/react';
import { useLocation, useNavigate } from 'react-router-dom';
import useFocusChatEffect from '../useFocusChatEffect';
import { logger } from '~/utils';

describe('useFocusChatEffect', () => {
  // Reset mocks before each test
  beforeEach(() => {
    mockLog = jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);

    // Mock window.matchMedia
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query === '(hover: hover)', // Desktop has hover capability
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

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/c/new',
        search: '',
      },
      writable: true,
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
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === '(pointer: coarse)', // Touchscreen has coarse pointer
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

  describe('URL parameter handling', () => {
    // Helper function to run tests with different URL scenarios
    const testUrlScenario = ({
      windowLocationSearch,
      reactRouterSearch,
      expectedUrl,
      testDescription,
    }: {
      windowLocationSearch: string;
      reactRouterSearch: string;
      expectedUrl: string;
      testDescription: string;
    }) => {
      test(`${testDescription}`, () => {
        // Mock window.location
        Object.defineProperty(window, 'location', {
          value: {
            pathname: '/c/new',
            search: windowLocationSearch,
          },
          writable: true,
        });

        // Mock React Router's location
        (useLocation as jest.Mock).mockReturnValue({
          pathname: '/c/new',
          search: reactRouterSearch,
          state: { focusChat: true },
        });

        renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

        expect(mockNavigate).toHaveBeenCalledWith(
          expectedUrl,
          expect.objectContaining({
            replace: true,
            state: {},
          }),
        );
      });
    };

    test('should use window.location.search instead of location.search', () => {
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/c/new',
          search: '?agent_id=test_agent_id',
        },
        writable: true,
      });

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?endpoint=openAI&model=gpt-4o-mini',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        // Should use window.location.search, not location.search
        '/c/new?agent_id=test_agent_id',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    testUrlScenario({
      windowLocationSearch: '?agent_id=agent123',
      reactRouterSearch: '?endpoint=openAI&model=gpt-4',
      expectedUrl: '/c/new?agent_id=agent123',
      testDescription: 'should prioritize window.location.search with agent_id parameter',
    });

    testUrlScenario({
      windowLocationSearch: '',
      reactRouterSearch: '?endpoint=openAI&model=gpt-4',
      expectedUrl: '/c/new',
      testDescription: 'should use empty path when window.location.search is empty',
    });

    testUrlScenario({
      windowLocationSearch: '?agent_id=agent123&prompt=test',
      reactRouterSearch: '',
      expectedUrl: '/c/new?agent_id=agent123&prompt=test',
      testDescription: 'should use window.location.search when React Router search is empty',
    });

    testUrlScenario({
      windowLocationSearch: '?agent_id=agent123',
      reactRouterSearch: '?agent_id=differentAgent',
      expectedUrl: '/c/new?agent_id=agent123',
      testDescription:
        'should use window.location.search even when both have agent_id but with different values',
    });

    testUrlScenario({
      windowLocationSearch: '?agent_id=agent/with%20spaces&prompt=test%20query',
      reactRouterSearch: '?endpoint=openAI',
      expectedUrl: '/c/new?agent_id=agent/with%20spaces&prompt=test%20query',
      testDescription: 'should handle URL parameters with special characters correctly',
    });

    testUrlScenario({
      windowLocationSearch:
        '?agent_id=agent123&prompt=test&model=gpt-4&temperature=0.7&max_tokens=1000',
      reactRouterSearch: '?endpoint=openAI',
      expectedUrl:
        '/c/new?agent_id=agent123&prompt=test&model=gpt-4&temperature=0.7&max_tokens=1000',
      testDescription: 'should handle multiple URL parameters correctly',
    });

    testUrlScenario({
      windowLocationSearch: '?agent_id=agent123&broken=param=with=equals',
      reactRouterSearch: '?endpoint=openAI',
      expectedUrl: '/c/new?agent_id=agent123&broken=param=with=equals',
      testDescription: 'should pass through malformed URL parameters unchanged',
    });

    test('should handle navigation immediately after URL parameter changes', () => {
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/c/new',
          search: '?endpoint=openAI&model=gpt-4',
        },
        writable: true,
      });

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?endpoint=openAI&model=gpt-4',
        state: { focusChat: true },
      });

      const { rerender } = renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new?endpoint=openAI&model=gpt-4',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );

      jest.clearAllMocks();

      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/c/new',
          search: '?agent_id=agent123',
        },
        writable: true,
      });

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new_changed',
        search: '?endpoint=openAI&model=gpt-4',
        state: { focusChat: true },
      });

      rerender();

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new_changed?agent_id=agent123',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    test('should handle undefined or null search params gracefully', () => {
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/c/new',
          search: undefined,
        },
        writable: true,
      });

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: undefined,
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );

      jest.clearAllMocks();

      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/c/new',
          search: null,
        },
        writable: true,
      });

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: null,
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    test('should handle navigation when location.state is null', () => {
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/c/new',
          search: '?agent_id=agent123',
        },
        writable: true,
      });

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?endpoint=openAI&model=gpt-4',
        state: null,
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockTextAreaRef.current.focus).not.toHaveBeenCalled();
    });

    test('should handle navigation when location.state.focusChat is undefined', () => {
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/c/new',
          search: '?agent_id=agent123',
        },
        writable: true,
      });

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?endpoint=openAI&model=gpt-4',
        state: { someOtherProp: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockTextAreaRef.current.focus).not.toHaveBeenCalled();
    });

    test('should handle navigation when both search params are empty', () => {
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/c/new',
          search: '',
        },
        writable: true,
      });

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });
  });
});
