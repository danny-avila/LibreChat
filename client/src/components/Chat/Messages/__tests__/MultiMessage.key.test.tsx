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
type KeyStrategy = 'messageId' | 'none';

function KeyTestWrapper({
  message,
  keyStrategy,
  onMount,
  onUnmount,
}: {
  message: TestMessage;
  keyStrategy: KeyStrategy;
  onMount: (id: string) => void;
  onUnmount: (id: string) => void;
}) {
  const key = keyStrategy === 'messageId' ? message.messageId : undefined;
  return (
    <TrackedChild key={key} messageId={message.messageId} onMount={onMount} onUnmount={onUnmount} />
  );
}

/**
 * Simulates the SSE message lifecycle where BOTH messageId AND parentMessageId
 * change at every event:
 * 1. useChatFunctions: client-generated messageId, parentMessageId = client user msg ID
 * 2. createdHandler: server-assigned messageId, parentMessageId = server request msg ID
 * 3. finalHandler: final server messageId, parentMessageId = final request msg ID
 */
const phases = {
  initial: {
    messageId: 'client-generated-uuid',
    parentMessageId: 'client-user-msg-id',
  },
  created: {
    messageId: 'client-user-msg-id_',
    parentMessageId: 'server-request-msg-id',
  },
  final: {
    messageId: 'server-final-response-id',
    parentMessageId: 'server-final-request-id',
  },
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
  describe('key={message.messageId} (original behavior)', () => {
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
      expect(mounts).toHaveLength(2);
    });

    it('causes 3 mounts and 2 unmounts across the full SSE lifecycle', () => {
      const { mounts, unmounts } = runLifecycle('messageId');
      expect(mounts).toHaveLength(3);
      expect(unmounts).toHaveLength(2);
    });
  });

  describe('no key (positional reconciliation)', () => {
    it('does NOT unmount on CREATED event — reuses the same instance', () => {
      const mounts: string[] = [];
      const unmounts: string[] = [];

      const { rerender } = render(
        <KeyTestWrapper
          message={phases.initial}
          keyStrategy="none"
          onMount={(id) => mounts.push(id)}
          onUnmount={(id) => unmounts.push(id)}
        />,
      );

      expect(mounts).toEqual(['client-generated-uuid']);

      rerender(
        <KeyTestWrapper
          message={phases.created}
          keyStrategy="none"
          onMount={(id) => mounts.push(id)}
          onUnmount={(id) => unmounts.push(id)}
        />,
      );

      expect(unmounts).toEqual([]);
      expect(mounts).toEqual(['client-generated-uuid']);
    });

    it('survives full SSE lifecycle with exactly 1 mount and 0 unmounts', () => {
      const { mounts, unmounts } = runLifecycle('none');
      expect(mounts).toHaveLength(1);
      expect(unmounts).toHaveLength(0);
    });
  });
});
