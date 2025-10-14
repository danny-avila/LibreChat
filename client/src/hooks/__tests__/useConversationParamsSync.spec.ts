import { renderHook } from '@testing-library/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { useConversationParamsSync } from '../useConversationParamsSync';
import { createChatSearchParams } from '~/utils';

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn(),
  useNavigate: jest.fn(),
  createSearchParams: jest.fn((params) => ({
    toString: () => new URLSearchParams(params).toString(),
  })),
}));

jest.mock('recoil', () => ({
  useRecoilValue: jest.fn(),
}));

jest.mock('~/utils', () => ({
  createChatSearchParams: jest.fn(),
}));

jest.mock('~/store', () => ({
  conversationByIndex: jest.fn((index) => ({ index })),
}));

describe('useConversationParamsSync', () => {
  const mockNavigate = jest.fn();
  const mockLocation = { pathname: '/c/new', search: '' };
  const baseConversation = {
    conversationId: Constants.NEW_CONVO,
    createdAt: '',
    disableParams: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    (useLocation as jest.Mock).mockReturnValue(mockLocation);
    (createChatSearchParams as jest.Mock).mockReturnValue({ model: 'gpt-4', endpoint: 'openai' });
  });

  describe('URL synchronization', () => {
    it('should update URL when all conditions are met', () => {
      (useRecoilValue as jest.Mock).mockReturnValue(baseConversation);

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).toHaveBeenCalledWith('/c/new?model=gpt-4&endpoint=openai', {
        replace: true,
      });
    });

    it('should not update URL when search params are already correct', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/new',
        search: '?model=gpt-4&endpoint=openai',
      });
      (useRecoilValue as jest.Mock).mockReturnValue(baseConversation);

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should preserve pathname when updating search params', () => {
      (useLocation as jest.Mock).mockReturnValue({
        pathname: '/c/12345',
        search: '',
      });
      (useRecoilValue as jest.Mock).mockReturnValue(baseConversation);

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).toHaveBeenCalledWith('/c/12345?model=gpt-4&endpoint=openai', {
        replace: true,
      });
    });
  });

  describe('condition checks', () => {
    it('should not update when conversation is null or undefined', () => {
      [null, undefined].forEach((value) => {
        jest.clearAllMocks();
        (useRecoilValue as jest.Mock).mockReturnValue(value);

        renderHook(() => useConversationParamsSync(0));

        expect(mockNavigate).not.toHaveBeenCalled();
        expect(createChatSearchParams).not.toHaveBeenCalled();
      });
    });

    it('should not update when index is not 0', () => {
      (useRecoilValue as jest.Mock).mockReturnValue(baseConversation);

      const indices = [1, '1', -1, 0.5];
      indices.forEach((index) => {
        jest.clearAllMocks();
        renderHook(() => useConversationParamsSync(index));
        expect(mockNavigate).not.toHaveBeenCalled();
      });
    });

    it('should not update when disableParams is true', () => {
      (useRecoilValue as jest.Mock).mockReturnValue({
        ...baseConversation,
        disableParams: true,
      });

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should not update when createdAt is not empty', () => {
      (useRecoilValue as jest.Mock).mockReturnValue({
        ...baseConversation,
        createdAt: '2024-01-01',
      });

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should not update when conversationId is not NEW_CONVO', () => {
      (useRecoilValue as jest.Mock).mockReturnValue({
        ...baseConversation,
        conversationId: 'convo-123',
      });

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle string index "0"', () => {
      (useRecoilValue as jest.Mock).mockReturnValue(baseConversation);

      renderHook(() => useConversationParamsSync('0'));

      expect(mockNavigate).toHaveBeenCalledWith('/c/new?model=gpt-4&endpoint=openai', {
        replace: true,
      });
    });

    it('should handle special characters in search params', () => {
      (createChatSearchParams as jest.Mock).mockReturnValue({
        model: 'gpt-4',
        prompt: 'hello world?&=test',
      });
      (useRecoilValue as jest.Mock).mockReturnValue(baseConversation);

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).toHaveBeenCalledWith(
        '/c/new?model=gpt-4&prompt=hello+world%3F%26%3Dtest',
        { replace: true },
      );
    });

    it('should handle conversation without disableParams property', () => {
      const conversation = {
        conversationId: Constants.NEW_CONVO,
        createdAt: '',
      };
      (useRecoilValue as jest.Mock).mockReturnValue(conversation);

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).toHaveBeenCalledWith('/c/new?model=gpt-4&endpoint=openai', {
        replace: true,
      });
    });

    it('should re-run effect when dependencies change', () => {
      const { rerender } = renderHook(({ index }) => useConversationParamsSync(index), {
        initialProps: { index: 0 },
      });

      (useRecoilValue as jest.Mock).mockReturnValue(baseConversation);

      expect(mockNavigate).toHaveBeenCalledTimes(1);

      rerender({ index: 1 });
      expect(mockNavigate).toHaveBeenCalledTimes(1);

      rerender({ index: 0 });
      expect(mockNavigate).toHaveBeenCalledTimes(2);
    });

    it('should handle many search params', () => {
      const manyParams = {};
      for (let i = 0; i < 50; i++) {
        manyParams[`param${i}`] = `value${i}`;
      }
      (createChatSearchParams as jest.Mock).mockReturnValue(manyParams);
      (useRecoilValue as jest.Mock).mockReturnValue(baseConversation);

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).toHaveBeenCalled();
      const callArg = mockNavigate.mock.calls[0][0];
      expect(callArg).toContain('param0=value0');
      expect(callArg).toContain('param49=value49');
    });

    it('should handle extremely long prompt parameter', () => {
      const longPrompt = 'a'.repeat(1000);
      (createChatSearchParams as jest.Mock).mockReturnValue({
        model: 'gpt-4',
        prompt: longPrompt,
      });
      (useRecoilValue as jest.Mock).mockReturnValue(baseConversation);

      renderHook(() => useConversationParamsSync(0));

      expect(mockNavigate).toHaveBeenCalled();
      const callArg = mockNavigate.mock.calls[0][0];
      expect(callArg).toContain('model=gpt-4');
      expect(callArg).toContain(`prompt=${encodeURIComponent(longPrompt)}`);
      expect(callArg.length).toBeGreaterThan(1000);
    });
  });
});
