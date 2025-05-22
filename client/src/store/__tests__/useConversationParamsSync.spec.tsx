import { renderHook } from '@testing-library/react';
import { createSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { RecoilRoot } from 'recoil';
import { createChatSearchParams } from '~/utils';
import families from '../families';

const mockNavigate = jest.fn();
const mockLocation = {
  pathname: '/c/new',
  search: '',
};

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn(),
  useNavigate: jest.fn(),
  createSearchParams: jest.fn(),
}));

jest.mock('~/utils', () => ({
  createChatSearchParams: jest.fn(),
}));

const { useConversationParamsSync, conversationByIndex } = families;

const renderHookWithRecoil = (hook: () => void, initializeState?: any) => {
  return renderHook(hook, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot initializeState={initializeState}>{children}</RecoilRoot>
    ),
  });
};

describe('useConversationParamsSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    (useLocation as jest.Mock).mockReturnValue(mockLocation);
    (createChatSearchParams as jest.Mock).mockReturnValue({ endpoint: 'openAI', model: 'gpt-4' });

    (createSearchParams as jest.Mock).mockImplementation((params) => ({
      toString: () => new URLSearchParams(params).toString(),
    }));
  });

  describe('URL parameter synchronization', () => {
    test('should update URL parameters when conversation changes for index 0', () => {
      const mockConversation = {
        conversationId: 'test-123',
        endpoint: 'openAI',
        model: 'gpt-4',
        disableParams: false,
        createdAt: '',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex(0), mockConversation);
      };

      renderHookWithRecoil(() => useConversationParamsSync(0), initializeState);

      expect(createChatSearchParams).toHaveBeenCalledWith(mockConversation);
      expect(mockNavigate).toHaveBeenCalledWith('/c/new?endpoint=openAI&model=gpt-4', {
        replace: true,
      });
    });

    test('should not update URL parameters when conversation changes for non-zero index', () => {
      const mockConversation = {
        conversationId: 'test-123',
        endpoint: 'openAI',
        model: 'gpt-4',
        disableParams: false,
        createdAt: '',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex(1), mockConversation);
      };

      renderHookWithRecoil(() => useConversationParamsSync(1), initializeState);

      expect(createChatSearchParams).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should not update URL when disableParams is true', () => {
      const mockConversation = {
        conversationId: 'test-123',
        endpoint: 'openAI',
        model: 'gpt-4',
        disableParams: true,
        createdAt: '',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex(0), mockConversation);
      };

      renderHookWithRecoil(() => useConversationParamsSync(0), initializeState);

      expect(createChatSearchParams).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should not update URL when createdAt is not empty', () => {
      const mockConversation = {
        conversationId: 'test-123',
        endpoint: 'openAI',
        model: 'gpt-4',
        disableParams: false,
        createdAt: '2023-12-01T10:00:00Z',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex(0), mockConversation);
      };

      renderHookWithRecoil(() => useConversationParamsSync(0), initializeState);

      expect(createChatSearchParams).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should not update URL when conversation is null', () => {
      const initializeState = ({ set }: any) => {
        set(conversationByIndex(0), null);
      };

      renderHookWithRecoil(() => useConversationParamsSync(0), initializeState);

      expect(createChatSearchParams).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('React Router DOM integration', () => {
    test('should use useLocation and useNavigate hooks', () => {
      const mockConversation = {
        conversationId: 'test-123',
        endpoint: 'openAI',
        model: 'gpt-4',
        disableParams: false,
        createdAt: '',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex(0), mockConversation);
      };

      renderHookWithRecoil(() => useConversationParamsSync(0), initializeState);

      expect(useLocation).toHaveBeenCalled();
      expect(useNavigate).toHaveBeenCalled();
    });

    test('should use location.pathname in URL construction', () => {
      const customPathname = '/c/conversation-abc123';
      (useLocation as jest.Mock).mockReturnValue({
        pathname: customPathname,
        search: '',
      });

      const mockConversation = {
        conversationId: 'test-123',
        endpoint: 'anthropic',
        model: 'claude-3',
        disableParams: false,
        createdAt: '',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex(0), mockConversation);
      };

      (createChatSearchParams as jest.Mock).mockReturnValue({
        endpoint: 'anthropic',
        model: 'claude-3',
      });

      renderHookWithRecoil(() => useConversationParamsSync(0), initializeState);

      expect(mockNavigate).toHaveBeenCalledWith(
        `${customPathname}?endpoint=anthropic&model=claude-3`,
        { replace: true },
      );
    });

    test('should handle complex conversation parameters', () => {
      const mockConversation = {
        conversationId: 'complex-test',
        endpoint: 'openAI',
        model: 'gpt-4-turbo',
        temperature: 0.7,
        maxTokens: 2000,
        systemMessage: 'You are a helpful assistant',
        disableParams: false,
        createdAt: '',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex(0), mockConversation);
      };

      (createChatSearchParams as jest.Mock).mockReturnValue({
        endpoint: 'openAI',
        model: 'gpt-4-turbo',
        temperature: '0.7',
        maxTokens: '2000',
      });

      renderHookWithRecoil(() => useConversationParamsSync(0), initializeState);

      expect(createChatSearchParams).toHaveBeenCalledWith(mockConversation);
      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new?endpoint=openAI&model=gpt-4-turbo&temperature=0.7&maxTokens=2000',
        { replace: true },
      );
    });
  });

  describe('Edge cases', () => {
    test('should handle empty search params from createChatSearchParams', () => {
      const mockConversation = {
        conversationId: 'test-123',
        endpoint: 'openAI',
        model: 'gpt-4',
        disableParams: false,
        createdAt: '',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex(0), mockConversation);
      };

      (createChatSearchParams as jest.Mock).mockReturnValue({});
      (createSearchParams as jest.Mock).mockImplementation(() => ({
        toString: () => '',
      }));

      renderHookWithRecoil(() => useConversationParamsSync(0), initializeState);

      expect(mockNavigate).toHaveBeenCalledWith('/c/new?', { replace: true });
    });

    test('should handle non-zero string index', () => {
      const mockConversation = {
        conversationId: 'test-123',
        endpoint: 'openAI',
        model: 'gpt-4',
        disableParams: false,
        createdAt: '',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex('1'), mockConversation);
      };

      renderHookWithRecoil(() => useConversationParamsSync('1'), initializeState);

      expect(createChatSearchParams).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('should handle zero string index', () => {
      const mockConversation = {
        conversationId: 'test-123',
        endpoint: 'openAI',
        model: 'gpt-4',
        disableParams: false,
        createdAt: '',
      };

      const initializeState = ({ set }: any) => {
        set(conversationByIndex('0'), mockConversation);
      };

      (createChatSearchParams as jest.Mock).mockReturnValue({ endpoint: 'openAI', model: 'gpt-4' });

      renderHookWithRecoil(() => useConversationParamsSync('0'), initializeState);

      expect(createChatSearchParams).toHaveBeenCalledWith(mockConversation);
      expect(mockNavigate).toHaveBeenCalledWith('/c/new?endpoint=openAI&model=gpt-4', {
        replace: true,
      });
    });
  });
});
