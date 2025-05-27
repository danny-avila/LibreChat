import { useQueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { RecoilRoot } from 'recoil';
import { useChatContext, useChatFormContext } from '~/Providers';
import useDefaultConvo from '~/hooks/Conversations/useDefaultConvo';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import store from '~/store';
import useQueryParams from '../useQueryParams';

const mockNavigate = jest.fn();
const mockSetSearchParams = jest.fn();

jest.mock('react-router-dom', () => ({
  useSearchParams: jest.fn(),
  useLocation: jest.fn(),
  useNavigate: jest.fn(),
  createSearchParams: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
  useChatFormContext: jest.fn(),
}));

jest.mock('~/hooks/Messages/useSubmitMessage', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('~/hooks/Conversations/useDefaultConvo', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const renderHookWithRecoil = (hook: () => void, initializeState?: any) => {
  return renderHook(hook, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={initializeState}>{children}</RecoilRoot>
    ),
  });
};

describe('useQueryParams - React Router DOM Navigation', () => {
  const mockTextAreaRef = createRef<HTMLTextAreaElement>();
  Object.defineProperty(mockTextAreaRef, 'current', {
    value: {
      focus: jest.fn(),
      setSelectionRange: jest.fn(),
    },
    writable: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    (useSearchParams as jest.Mock).mockReturnValue([new URLSearchParams(), mockSetSearchParams]);

    // Default mock for QueryClient with startup config
    const mockQueryClient = {
      getQueryData: jest.fn(() => ({
        modelSpecs: { list: [] },
        interface: {},
      })),
    };
    (useQueryClient as jest.Mock).mockReturnValue(mockQueryClient);
    (useLocation as jest.Mock).mockReturnValue({
      pathname: '/c/new',
      search: '',
    });

    (useQueryClient as jest.Mock).mockReturnValue({
      invalidateQueries: jest.fn(),
    });

    (useChatContext as jest.Mock).mockReturnValue({
      conversation: null,
      newConversation: jest.fn(),
    });

    (useChatFormContext as jest.Mock).mockReturnValue({
      handleSubmit: jest.fn((callback) => callback),
    });

    (useSubmitMessage as jest.Mock).mockReturnValue({
      submitMessage: jest.fn(),
    });

    (useDefaultConvo as jest.Mock).mockReturnValue(jest.fn());
  });

  describe('URL parameter cleanup with React Router DOM', () => {
    test('should use navigate() instead of window.history.replaceState() for URL cleanup', () => {
      const mockLocation = {
        pathname: '/c/test-conversation',
        search: '?endpoint=openAI&model=gpt-4',
      };

      (useLocation as jest.Mock).mockReturnValue(mockLocation);

      const searchParams = new URLSearchParams('endpoint=openAI&model=gpt-4&text=test message');
      (useSearchParams as jest.Mock).mockReturnValue([searchParams, mockSetSearchParams]);

      const initializeState = ({ set }: any) => {
        set(store.modularChat, false);
        set(store.availableTools, []);
      };

      renderHookWithRecoil(() => useQueryParams({ textAreaRef: mockTextAreaRef }), initializeState);

      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('window.history'));
    });

    test('should call navigate with pathname only when cleaning URL parameters', async () => {
      // Test that navigate() is called with just the pathname when URL parameters are processed
      const mockLocation = {
        pathname: '/c/conversation-123',
        search: '?prompt=hello&submit=false',
      };

      // Mock QueryClient with startup config data
      const mockQueryClient = {
        getQueryData: jest.fn(() => ({
          modelSpecs: { list: [] },
          interface: {},
        })),
      };
      (useQueryClient as jest.Mock).mockReturnValue(mockQueryClient);

      (useLocation as jest.Mock).mockReturnValue(mockLocation);
      (useSearchParams as jest.Mock).mockReturnValue([
        new URLSearchParams('prompt=hello&submit=false'),
        mockSetSearchParams,
      ]);

      const mockSubmitMessage = jest.fn();
      const mockSetValue = jest.fn();
      const mockHandleSubmit = jest.fn((callback) => {
        callback({ text: 'hello' });
      });

      (useChatFormContext as jest.Mock).mockReturnValue({
        handleSubmit: mockHandleSubmit,
        setValue: mockSetValue,
      });

      (useChatContext as jest.Mock).mockReturnValue({
        conversation: { conversationId: 'test-123' },
        newConversation: jest.fn(),
      });

      (useSubmitMessage as jest.Mock).mockReturnValue({
        submitMessage: mockSubmitMessage,
      });

      (useDefaultConvo as jest.Mock).mockReturnValue(jest.fn());

      const initializeState = ({ set }: any) => {
        set(store.modularChat, false);
        set(store.availableTools, []);
      };

      renderHookWithRecoil(() => useQueryParams({ textAreaRef: mockTextAreaRef }), initializeState);

      // Wait for the interval to process parameters
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockNavigate).toHaveBeenCalledWith('/c/conversation-123', { replace: true });
    });

    test('should use location.pathname from useLocation hook', async () => {
      // Test that the hook correctly uses the pathname from useLocation
      const testPathname = '/c/custom-path';
      const mockLocation = {
        pathname: testPathname,
        search: '?prompt=test&submit=false',
      };

      // Mock QueryClient with startup config data
      const mockQueryClient = {
        getQueryData: jest.fn(() => ({
          modelSpecs: { list: [] },
          interface: {},
        })),
      };
      (useQueryClient as jest.Mock).mockReturnValue(mockQueryClient);

      (useLocation as jest.Mock).mockReturnValue(mockLocation);
      (useSearchParams as jest.Mock).mockReturnValue([
        new URLSearchParams('prompt=test&submit=false'),
        mockSetSearchParams,
      ]);

      const mockSubmitMessage = jest.fn();
      const mockSetValue = jest.fn();
      const mockHandleSubmit = jest.fn((callback) => {
        callback({ text: 'test' });
      });
      (useChatFormContext as jest.Mock).mockReturnValue({
        handleSubmit: mockHandleSubmit,
        setValue: mockSetValue,
      });

      (useChatContext as jest.Mock).mockReturnValue({
        conversation: { conversationId: 'test-123' },
        newConversation: jest.fn(),
      });

      (useSubmitMessage as jest.Mock).mockReturnValue({
        submitMessage: mockSubmitMessage,
      });

      (useDefaultConvo as jest.Mock).mockReturnValue(jest.fn());

      const initializeState = ({ set }: any) => {
        set(store.modularChat, false);
        set(store.availableTools, []);
      };

      renderHookWithRecoil(() => useQueryParams({ textAreaRef: mockTextAreaRef }), initializeState);

      // Wait for the interval to process parameters
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockNavigate).toHaveBeenCalledWith(testPathname, { replace: true });
    });

    test('should handle empty search params correctly', async () => {
      // Test that the hook handles cases with empty search params in location
      const mockLocation = {
        pathname: '/c/new',
        search: '',
      };

      // Mock QueryClient with startup config data
      const mockQueryClient = {
        getQueryData: jest.fn(() => ({
          modelSpecs: { list: [] },
          interface: {},
        })),
      };
      (useQueryClient as jest.Mock).mockReturnValue(mockQueryClient);

      (useLocation as jest.Mock).mockReturnValue(mockLocation);
      (useSearchParams as jest.Mock).mockReturnValue([
        new URLSearchParams('prompt=test message&submit=false'),
        mockSetSearchParams,
      ]);

      const mockSubmitMessage = jest.fn();
      const mockSetValue = jest.fn();
      const mockHandleSubmit = jest.fn((callback) => {
        callback({ text: 'test message' });
      });
      (useChatFormContext as jest.Mock).mockReturnValue({
        handleSubmit: mockHandleSubmit,
        setValue: mockSetValue,
      });

      (useChatContext as jest.Mock).mockReturnValue({
        conversation: { conversationId: 'test-123' },
        newConversation: jest.fn(),
      });

      (useSubmitMessage as jest.Mock).mockReturnValue({
        submitMessage: mockSubmitMessage,
      });

      (useDefaultConvo as jest.Mock).mockReturnValue(jest.fn());

      const initializeState = ({ set }: any) => {
        set(store.modularChat, false);
        set(store.availableTools, []);
      };

      renderHookWithRecoil(() => useQueryParams({ textAreaRef: mockTextAreaRef }), initializeState);

      // Wait for the interval to process parameters
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockNavigate).toHaveBeenCalledWith('/c/new', { replace: true });
    });
  });

  describe('React Router DOM integration', () => {
    test('should use useLocation and useNavigate hooks', () => {
      const initializeState = ({ set }: any) => {
        set(store.modularChat, false);
        set(store.availableTools, []);
      };

      renderHookWithRecoil(() => useQueryParams({ textAreaRef: mockTextAreaRef }), initializeState);

      expect(useLocation).toHaveBeenCalled();
      expect(useNavigate).toHaveBeenCalled();
      expect(useSearchParams).toHaveBeenCalled();
    });

    test('should not use window.location or window.history directly', () => {
      const originalWindowLocation = window.location;
      const originalWindowHistory = window.history;

      const mockWindowLocation = {
        ...originalWindowLocation,
        pathname: '/test',
      };
      const mockWindowHistory = {
        ...originalWindowHistory,
        replaceState: jest.fn(),
        pushState: jest.fn(),
      };

      Object.defineProperty(window, 'location', {
        value: mockWindowLocation,
        writable: true,
      });
      Object.defineProperty(window, 'history', {
        value: mockWindowHistory,
        writable: true,
      });

      const initializeState = ({ set }: any) => {
        set(store.modularChat, false);
        set(store.availableTools, []);
      };

      renderHookWithRecoil(() => useQueryParams({ textAreaRef: mockTextAreaRef }), initializeState);

      expect(mockWindowHistory.replaceState).not.toHaveBeenCalled();
      expect(mockWindowHistory.pushState).not.toHaveBeenCalled();

      Object.defineProperty(window, 'location', {
        value: originalWindowLocation,
        writable: true,
      });
      Object.defineProperty(window, 'history', {
        value: originalWindowHistory,
        writable: true,
      });
    });
  });
});
