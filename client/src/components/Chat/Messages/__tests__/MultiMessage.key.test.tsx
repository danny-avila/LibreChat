import React, { useEffect, useRef } from 'react';
import { render } from '@testing-library/react';

/**
 * Minimal stand-in for a message component rendered by MultiMessage.
 * Tracks mount/unmount via a ref + callbacks so we can assert whether
 * React is reusing the instance (prop update) or destroying and
 * recreating it (unmount/remount from key change).
 */
function TrackedChild({
  messageId,
  onMount,
  onUnmount,
}: {
  messageId: string;
  onMount: (id: string) => void;
  onUnmount: (id: string) => void;
}) {
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      onMount(messageId);
    }
    return () => {
      onUnmount(messageId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div data-testid="child" data-message-id={messageId} />;
}

type TestMessage = { messageId: string; parentMessageId: string };
type KeyStrategy = 'messageId' | 'parentMessageId+siblingIdx';

function KeyTestWrapper({
  message,
  siblingIdx = 0,
  keyStrategy,
  onMount,
  onUnmount,
}: {
  message: TestMessage;
  siblingIdx?: number;
  keyStrategy: KeyStrategy;
  onMount: (id: string) => void;
  onUnmount: (id: string) => void;
}) {
  const key =
    keyStrategy === 'messageId' ? message.messageId : `${message.parentMessageId}_${siblingIdx}`;
  return (
    <TrackedChild key={key} messageId={message.messageId} onMount={onMount} onUnmount={onUnmount} />
  );
}

/**
 * Simulates the SSE message lifecycle:
 * 1. useChatFunctions creates initialResponse with client-generated messageId
 * 2. createdHandler replaces it with messageId: userMessageId + '_'
 * 3. finalHandler replaces it with server-assigned responseMessage.messageId
 *
 * parentMessageId (the user message ID) stays constant throughout.
 */
const userMessageId = 'user-msg-abc123';
const phases = {
  initial: { messageId: 'client-generated-uuid', parentMessageId: userMessageId },
  created: { messageId: `${userMessageId}_`, parentMessageId: userMessageId },
  final: { messageId: 'server-assigned-uuid-xyz', parentMessageId: userMessageId },
};

function runLifecycle(keyStrategy: KeyStrategy) {
  const mounts: string[] = [];
  const unmounts: string[] = [];
  const callbacks = {
    onMount: (id: string) => mounts.push(id),
    onUnmount: (id: string) => unmounts.push(id),
  };

  const { rerender } = render(
    <KeyTestWrapper message={phases.initial} keyStrategy={keyStrategy} {...callbacks} />,
  );
  rerender(<KeyTestWrapper message={phases.created} keyStrategy={keyStrategy} {...callbacks} />);
  rerender(<KeyTestWrapper message={phases.final} keyStrategy={keyStrategy} {...callbacks} />);

  return { mounts, unmounts };
}

describe('MultiMessage key stability', () => {
  describe('key={message.messageId} (current behavior)', () => {
    it('unmounts and remounts on CREATED event when messageId changes', () => {
      const mounts: string[] = [];
      const unmounts: string[] = [];

      const { rerender } = render(
        <KeyTestWrapper
          message={phases.initial}
          keyStrategy="messageId"
          onMount={(id) => mounts.push(id)}
          onUnmount={(id) => unmounts.push(id)}
        />,
      );

      expect(mounts).toEqual(['client-generated-uuid']);
      expect(unmounts).toEqual([]);

      rerender(
        <KeyTestWrapper
          message={phases.created}
          keyStrategy="messageId"
          onMount={(id) => mounts.push(id)}
          onUnmount={(id) => unmounts.push(id)}
        />,
      );

      expect(unmounts).toEqual(['client-generated-uuid']);
      expect(mounts).toEqual(['client-generated-uuid', `${userMessageId}_`]);
    });

    it('causes 3 mounts and 2 unmounts across the full SSE lifecycle', () => {
      const { mounts, unmounts } = runLifecycle('messageId');
      expect(mounts).toHaveLength(3);
      expect(unmounts).toHaveLength(2);
    });
  });

  describe('key={parentMessageId + siblingIdx} (stable key)', () => {
    it('does NOT unmount on CREATED event — reuses the same instance', () => {
      const mounts: string[] = [];
      const unmounts: string[] = [];

      const { rerender } = render(
        <KeyTestWrapper
          message={phases.initial}
          keyStrategy="parentMessageId+siblingIdx"
          onMount={(id) => mounts.push(id)}
          onUnmount={(id) => unmounts.push(id)}
        />,
      );

      expect(mounts).toEqual(['client-generated-uuid']);

      rerender(
        <KeyTestWrapper
          message={phases.created}
          keyStrategy="parentMessageId+siblingIdx"
          onMount={(id) => mounts.push(id)}
          onUnmount={(id) => unmounts.push(id)}
        />,
      );

      expect(unmounts).toEqual([]);
      expect(mounts).toEqual(['client-generated-uuid']);
    });

    it('survives full SSE lifecycle with exactly 1 mount and 0 unmounts', () => {
      const { mounts, unmounts } = runLifecycle('parentMessageId+siblingIdx');
      expect(mounts).toHaveLength(1);
      expect(unmounts).toHaveLength(0);
    });

    it('remounts when switching siblings (different siblingIdx)', () => {
      const siblingA: TestMessage = {
        messageId: 'sibling-a-id',
        parentMessageId: userMessageId,
      };
      const siblingB: TestMessage = {
        messageId: 'sibling-b-id',
        parentMessageId: userMessageId,
      };
      const mounts: string[] = [];
      const unmounts: string[] = [];
      const callbacks = {
        onMount: (id: string) => mounts.push(id),
        onUnmount: (id: string) => unmounts.push(id),
      };

      const { rerender } = render(
        <KeyTestWrapper
          message={siblingA}
          siblingIdx={0}
          keyStrategy="parentMessageId+siblingIdx"
          {...callbacks}
        />,
      );

      expect(mounts).toEqual(['sibling-a-id']);

      // Switch to sibling B at siblingIdx=1 → key changes → clean remount
      rerender(
        <KeyTestWrapper
          message={siblingB}
          siblingIdx={1}
          keyStrategy="parentMessageId+siblingIdx"
          {...callbacks}
        />,
      );

      expect(unmounts).toEqual(['sibling-a-id']);
      expect(mounts).toEqual(['sibling-a-id', 'sibling-b-id']);
    });
  });
});
