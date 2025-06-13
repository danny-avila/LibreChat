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

  describe('URL parameter handling', () => {
    test('should use React Router location.search', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?endpoint=openAI&model=gpt-4o-mini',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new?endpoint=openAI&model=gpt-4o-mini',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    test('should handle empty search params', () => {
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

    test('should handle search params with agent_id', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?agent_id=agent123&prompt=test',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new?agent_id=agent123&prompt=test',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    test('should handle URL parameters with special characters correctly', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?agent_id=agent/with%20spaces&prompt=test%20query',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new?agent_id=agent/with%20spaces&prompt=test%20query',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    test('should handle multiple URL parameters correctly', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?agent_id=agent123&prompt=test&model=gpt-4&temperature=0.7&max_tokens=1000',
        state: { focusChat: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new?agent_id=agent123&prompt=test&model=gpt-4&temperature=0.7&max_tokens=1000',
        expect.objectContaining({
          replace: true,
          state: {},
        }),
      );
    });

    test('should handle navigation immediately after URL parameter changes', () => {
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

      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new_changed',
        search: '?agent_id=agent123',
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
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?agent_id=agent123',
        state: null,
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockTextAreaRef.current.focus).not.toHaveBeenCalled();
    });

    test('should handle navigation when location.state.focusChat is undefined', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?agent_id=agent123',
        state: { someOtherProp: true },
      });

      renderHook(() => useFocusChatEffect(mockTextAreaRef as any));

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockTextAreaRef.current.focus).not.toHaveBeenCalled();
    });

    test('should handle navigation when both search params are empty', () => {
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
