import { renderHook } from '@testing-library/react';
import {
  useOptionalMessagesOperations,
  useOptionalMessagesConversation,
} from '../MessagesViewContext';

describe('useOptionalMessagesOperations', () => {
  it('returns noop stubs when rendered outside MessagesViewProvider', () => {
    const { result } = renderHook(() => useOptionalMessagesOperations());

    expect(result.current.ask).toBeInstanceOf(Function);
    expect(result.current.regenerate).toBeInstanceOf(Function);
    expect(result.current.handleContinue).toBeInstanceOf(Function);
    expect(result.current.getMessages).toBeInstanceOf(Function);
    expect(result.current.setMessages).toBeInstanceOf(Function);
  });

  it('noop stubs do not throw when called', () => {
    const { result } = renderHook(() => useOptionalMessagesOperations());

    expect(() => result.current.ask({} as never)).not.toThrow();
    expect(() => result.current.regenerate({} as never)).not.toThrow();
    expect(() => result.current.handleContinue({} as never)).not.toThrow();
    expect(() => result.current.setMessages([])).not.toThrow();
  });

  it('getMessages returns undefined outside the provider', () => {
    const { result } = renderHook(() => useOptionalMessagesOperations());
    expect(result.current.getMessages()).toBeUndefined();
  });

  it('returns stable references across re-renders', () => {
    const { result, rerender } = renderHook(() => useOptionalMessagesOperations());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useOptionalMessagesConversation', () => {
  it('returns undefined fields when rendered outside MessagesViewProvider', () => {
    const { result } = renderHook(() => useOptionalMessagesConversation());
    expect(result.current.conversation).toBeUndefined();
    expect(result.current.conversationId).toBeUndefined();
  });

  it('returns stable references across re-renders', () => {
    const { result, rerender } = renderHook(() => useOptionalMessagesConversation());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
