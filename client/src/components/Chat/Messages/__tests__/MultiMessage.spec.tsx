import React from 'react';
import { RecoilRoot } from 'recoil';
import { getDefaultStore } from 'jotai';
import { ContentTypes } from 'librechat-data-provider';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';
import { activeSpeechMessageIdAtom } from '~/hooks/Messages/rowWindowState';
import MultiMessage from '../MultiMessage';

type RowProps = {
  message: TMessage;
  siblingIdx?: number;
  setSiblingIdx?: (value: number) => void;
};

/** Row stub exposing the sibling switcher contract (display-order index). */
const createRowStub = () => {
  const { createElement } = jest.requireActual<typeof React>('react');
  return ({ message, siblingIdx = 0, setSiblingIdx }: RowProps) => {
    const steer = message.content?.find((part) => part?.type === ContentTypes.STEER);
    return createElement(
      'div',
      null,
      createElement(
        'div',
        { 'data-testid': 'row', id: message.messageId, role: 'group' },
        message.messageId,
      ),
      steer?.steerId
        ? createElement('div', { id: `steer-${steer.steerId}`, className: 'steer-render' })
        : null,
      createElement(
        'button',
        { 'data-testid': 'prev', onClick: () => setSiblingIdx?.(siblingIdx - 1) },
        'prev',
      ),
    );
  };
};

jest.mock('~/components/Messages/MessageContent', () => ({
  __esModule: true,
  default: createRowStub(),
}));
jest.mock('../MessageParts', () => ({ __esModule: true, default: createRowStub() }));
jest.mock('../Message', () => ({ __esModule: true, default: createRowStub() }));
jest.mock('~/components/Chat/Subagents/EventSubagentActivityGroup', () => ({
  __esModule: true,
  default: ({
    parentMessageIds,
    hasParallelContent,
  }: {
    parentMessageIds: string[];
    hasParallelContent?: boolean;
  }) => (
    <div
      data-testid="event-subagent-activity"
      data-parent-message-ids={parentMessageIds.join(',')}
      data-has-parallel-content={String(hasParallelContent)}
    />
  ),
}));

const msg = (messageId: string): TMessage =>
  ({
    messageId,
    parentMessageId: 'parent-1',
    conversationId: 'c1',
    isCreatedByUser: false,
    text: messageId,
    content: [{ type: 'text', text: messageId }],
    children: [],
  }) as unknown as TMessage;

const tree = (ids: string[]) => ids.map((id) => msg(id));

const treeElement = (ids: string[]) => (
  <RecoilRoot>
    <MultiMessage
      messageId="parent-1"
      messagesTree={tree(ids)}
      currentEditId={null}
      setCurrentEditId={jest.fn()}
    />
  </RecoilRoot>
);

const displayed = () => screen.getAllByTestId('row')[0].textContent;

describe('MultiMessage sibling selection', () => {
  it('hosts event activity for structured and legacy message rows', () => {
    const structured = msg('structured');
    const legacy = { ...msg('legacy'), content: undefined } as TMessage;
    const view = render(
      <RecoilRoot>
        <MultiMessage
          messageId="parent-1"
          messagesTree={[structured]}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>,
    );

    expect(screen.getByTestId('event-subagent-activity')).toHaveAttribute(
      'data-parent-message-ids',
      'structured,parent-1',
    );

    view.rerender(
      <RecoilRoot>
        <MultiMessage
          messageId="parent-1"
          messagesTree={[legacy]}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>,
    );
    expect(screen.getByTestId('event-subagent-activity')).toHaveAttribute(
      'data-parent-message-ids',
      'legacy,parent-1',
    );
  });

  it('places a user-anchored event group after the assistant response', () => {
    const assistant = msg('assistant');
    const user = {
      ...msg('user'),
      isCreatedByUser: true,
      parentMessageId: 'root',
      children: [assistant],
    } as TMessage;
    assistant.parentMessageId = 'user';

    render(
      <RecoilRoot>
        <MultiMessage
          messageId="root"
          messagesTree={[user]}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>,
    );

    expect(screen.getAllByTestId('event-subagent-activity')).toHaveLength(1);
    expect(screen.getByTestId('event-subagent-activity')).toHaveAttribute(
      'data-parent-message-ids',
      'assistant,user',
    );
    expect(
      screen
        .getByText('assistant')
        .compareDocumentPosition(screen.getByTestId('event-subagent-activity')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('hides merged event activity while its user anchor is being edited', () => {
    const assistant = { ...msg('assistant'), parentMessageId: 'user' } as TMessage;
    const user = {
      ...msg('user'),
      isCreatedByUser: true,
      parentMessageId: 'root',
      children: [assistant],
    } as TMessage;

    render(
      <RecoilRoot>
        <MultiMessage
          messageId="root"
          messagesTree={[user]}
          currentEditId="user"
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>,
    );

    expect(screen.queryByTestId('event-subagent-activity')).not.toBeInTheDocument();
  });

  it('matches the wider layout of a parallel assistant response', () => {
    const assistant = {
      ...msg('assistant'),
      content: [{ type: 'text', text: 'answer', groupId: 'parallel-group' }],
    } as unknown as TMessage;

    render(
      <RecoilRoot>
        <MultiMessage
          messageId="parent-1"
          messagesTree={[assistant]}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>,
    );

    expect(screen.getByTestId('event-subagent-activity')).toHaveAttribute(
      'data-has-parallel-content',
      'true',
    );
  });

  it('renders assistant content containing an undefined streaming placeholder', () => {
    const assistant = {
      ...msg('assistant'),
      content: [undefined, { type: 'text', text: 'answer' }],
    } as unknown as TMessage;

    render(
      <RecoilRoot>
        <MultiMessage
          messageId="parent-1"
          messagesTree={[assistant]}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>,
    );

    expect(screen.getByTestId('row')).toHaveTextContent('assistant');
    expect(screen.getByTestId('event-subagent-activity')).toHaveAttribute(
      'data-has-parallel-content',
      'false',
    );
  });

  it('shows the newest sibling by default and follows a newly appended one', () => {
    const view = render(treeElement(['a', 'b']));
    expect(displayed()).toBe('b');

    view.rerender(treeElement(['a', 'b', 'c']));
    expect(displayed()).toBe('c');
  });

  /**
   * Regression: background cache churn (an abandoned preempt sibling restored
   * at finalize, a refetch merge) must not yank the user off the branch they
   * navigated to. Only a NEW newest sibling (a submission landing at this
   * level) moves the selection.
   */
  it('keeps the viewed older branch when a middle sibling appears without a new newest', () => {
    const view = render(treeElement(['a', 'b']));
    expect(displayed()).toBe('b');

    fireEvent.click(screen.getAllByTestId('prev')[0]);
    expect(displayed()).toBe('a');

    view.rerender(treeElement(['a', 'restored-middle', 'b']));
    expect(displayed()).toBe('a');
  });

  it('still follows a new newest sibling from an older branch (regenerate lands)', () => {
    const view = render(treeElement(['a', 'b']));
    fireEvent.click(screen.getAllByTestId('prev')[0]);
    expect(displayed()).toBe('a');

    view.rerender(treeElement(['a', 'b', 'c']));
    expect(displayed()).toBe('c');
  });

  it('falls back to the newest when the viewed sibling disappears', () => {
    const view = render(treeElement(['a', 'b', 'c']));
    fireEvent.click(screen.getAllByTestId('prev')[0]);
    fireEvent.click(screen.getAllByTestId('prev')[0]);
    expect(displayed()).toBe('a');

    view.rerender(treeElement(['b', 'c']));
    expect(displayed()).toBe('c');
  });

  it('keeps the same-position display stable across content-only tree rebuilds', () => {
    const view = render(treeElement(['a', 'b']));
    fireEvent.click(screen.getAllByTestId('prev')[0]);
    expect(displayed()).toBe('a');

    /** Streaming mints a fresh array each write with identical membership. */
    view.rerender(treeElement(['a', 'b']));
    expect(displayed()).toBe('a');
  });

  /**
   * Regression: streaming ids hydrate to durable ids at finalize (the legacy
   * regenerate path mints a new UUID for `_`-suffixed preliminary ids). The
   * newest child's id changing WITHOUT the prior newest surviving is a
   * re-key of the same row, not an append — it must not yank a user who
   * paged to an older sibling mid-stream.
   */
  it('keeps the viewed older branch when the newest sibling is re-keyed at finalize', () => {
    const view = render(treeElement(['a', 'streaming_']));
    fireEvent.click(screen.getAllByTestId('prev')[0]);
    expect(displayed()).toBe('a');

    view.rerender(treeElement(['a', 'durable-id']));
    expect(displayed()).toBe('a');
  });

  it('keeps the viewed branch when a re-key lands together with restored middle siblings', () => {
    const view = render(treeElement(['a', 'streaming_']));
    fireEvent.click(screen.getAllByTestId('prev')[0]);
    expect(displayed()).toBe('a');

    view.rerender(treeElement(['a', 'restored-middle', 'durable-id']));
    expect(displayed()).toBe('a');
  });

  it('still follows a genuine append after a re-key settled', () => {
    const view = render(treeElement(['a', 'streaming_']));
    fireEvent.click(screen.getAllByTestId('prev')[0]);
    view.rerender(treeElement(['a', 'durable-id']));
    expect(displayed()).toBe('a');

    view.rerender(treeElement(['a', 'durable-id', 'appended']));
    expect(displayed()).toBe('appended');
  });

  /**
   * Regression: sibling `createdAt` ties have no sort tie-breaker, so a
   * refetch can return the same membership in a different order. A changed
   * last id without a NEW member is a reorder, not an append — the viewed
   * message must stay selected by identity.
   */
  it('treats a same-membership reorder as churn, not an append', () => {
    const view = render(treeElement(['a', 'b', 'c']));
    fireEvent.click(screen.getAllByTestId('prev')[0]);
    expect(displayed()).toBe('b');

    view.rerender(treeElement(['b', 'c', 'a']));
    expect(displayed()).toBe('b');
  });

  /**
   * Regression: the recursive instance is deliberately unkeyed and gets
   * reused across parents when an ancestor's branch switches. The
   * reconciliation refs then describe the previous parent's children —
   * reconciling against them wiped the returned-to branch's saved selection.
   */
  it("preserves each parent's saved selection when the instance is reused across parents", () => {
    const treeFor = (messageId: string, ids: string[]) => (
      <RecoilRoot>
        <MultiMessage
          messageId={messageId}
          messagesTree={tree(ids)}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RecoilRoot>
    );

    const view = render(treeFor('parent-a', ['a1', 'a2']));
    fireEvent.click(screen.getAllByTestId('prev')[0]);
    expect(displayed()).toBe('a1');

    view.rerender(treeFor('parent-b', ['b1', 'b2', 'b3']));
    expect(displayed()).toBe('b3');

    view.rerender(treeFor('parent-a', ['a1', 'a2']));
    expect(displayed()).toBe('a1');
  });
});

describe('MultiMessage row mount window', () => {
  const { RowMountProvider } =
    jest.requireActual<typeof import('~/hooks/Messages')>('~/hooks/Messages');

  const chain = (): TMessage => {
    const leaf = { ...msg('m2'), parentMessageId: 'm1', depth: 2 } as TMessage;
    const mid = { ...msg('m1'), parentMessageId: 'm0', depth: 1, children: [leaf] } as TMessage;
    return { ...msg('m0'), depth: 0, children: [mid] } as TMessage;
  };

  const windowedTree = (
    mountWindow: {
      mode: 'progressive' | 'bounded';
      start: number;
      end: number;
      tailStart?: number;
      heights?: ReadonlyMap<number, { messageId: string; height: number }>;
      pinnedRows?: ReadonlyMap<number, string>;
      pinRow?: (depth: number, messageId: string) => void;
    } | null,
    root: TMessage = chain(),
  ) => (
    <RecoilRoot>
      <RowMountProvider mountWindow={mountWindow}>
        <MultiMessage
          messageId="parent-1"
          messagesTree={[root]}
          currentEditId={null}
          setCurrentEditId={jest.fn()}
        />
      </RowMountProvider>
    </RecoilRoot>
  );

  it('renders every row without a window', () => {
    render(windowedTree(null));
    expect(screen.getAllByTestId('row').map((r) => r.textContent)).toEqual(['m0', 'm1', 'm2']);
  });

  it('gates rows outside the window while the recursion continues below them', () => {
    render(windowedTree({ mode: 'progressive', start: 2, end: 2 }));
    expect(screen.getAllByTestId('row').map((r) => r.textContent)).toEqual(['m2']);
  });

  it('mounts newly windowed rows above without disturbing deeper rows', () => {
    const view = render(windowedTree({ mode: 'progressive', start: 2, end: 2 }));
    view.rerender(windowedTree({ mode: 'progressive', start: 1, end: 2 }));
    expect(screen.getAllByTestId('row').map((r) => r.textContent)).toEqual(['m1', 'm2']);

    view.rerender(windowedTree(null));
    expect(screen.getAllByTestId('row').map((r) => r.textContent)).toEqual(['m0', 'm1', 'm2']);
  });

  it('replaces measured rows outside a bounded window with exact-height message slots', () => {
    const heights = new Map([
      [0, { messageId: 'm0', height: 120 }],
      [1, { messageId: 'm1', height: 240 }],
      [2, { messageId: 'm2', height: 360 }],
    ]);
    const { container } = render(windowedTree({ mode: 'bounded', start: 1, end: 1, heights }));

    expect(screen.getAllByTestId('row').map((r) => r.textContent)).toEqual(['m1']);
    expect(container.querySelector<HTMLElement>('#m0')?.style.height).toBe('120px');
    expect(container.querySelector<HTMLElement>('#m2')?.style.height).toBe('360px');
    expect(container.querySelectorAll('[data-message-row-slot="true"]')).toHaveLength(3);
    expect(container.querySelector('#m0 [data-message-search-text="true"]')).toHaveTextContent(
      'm0',
    );
  });

  it('mounts a changed branch row until its new height is measured', () => {
    const staleHeights = new Map([[0, { messageId: 'other-branch', height: 120 }]]);
    render(windowedTree({ mode: 'bounded', start: 2, end: 2, heights: staleHeights }));

    expect(screen.getAllByTestId('row').map((r) => r.textContent)).toEqual(['m0', 'm1', 'm2']);
  });

  it('preserves focus on the stable row slot when its rich content mounts', () => {
    const heights = new Map([[0, { messageId: 'm0', height: 120 }]]);
    const view = render(windowedTree({ mode: 'bounded', start: 1, end: 2, heights }));
    const slot = view.container.querySelector<HTMLElement>('#m0');
    if (slot) slot.tabIndex = -1;
    slot?.focus();

    view.rerender(windowedTree({ mode: 'bounded', start: 0, end: 2, heights }));
    expect(document.activeElement).toHaveAttribute('id', 'm0');
    expect(document.activeElement).toHaveAttribute('role', 'group');
    expect(document.activeElement).not.toHaveAttribute('data-message-row-slot');
  });

  it('retains lightweight steer anchors in an off-window response', () => {
    const root = chain();
    root.content = [
      { type: ContentTypes.STEER, steer: 'Keep this direction', steerId: 'steer-1' },
    ] as TMessage['content'];
    const heights = new Map([[0, { messageId: 'm0', height: 120 }]]);
    const { container } = render(
      windowedTree({ mode: 'bounded', start: 1, end: 2, heights }, root),
    );

    expect(container.querySelector('#steer-steer-1')).toHaveClass('steer-render');
    expect(container.querySelector('#steer-steer-1 .message-content')).toHaveTextContent(
      'Keep this direction',
    );
  });

  it('transfers focus from a placeholder steer anchor to its mounted content', () => {
    const root = chain();
    root.content = [
      { type: ContentTypes.STEER, steer: 'Keep this direction', steerId: 'steer-1' },
    ] as TMessage['content'];
    const heights = new Map([[0, { messageId: 'm0', height: 120 }]]);
    const view = render(windowedTree({ mode: 'bounded', start: 1, end: 2, heights }, root));
    const placeholderAnchor = view.container.querySelector<HTMLElement>('#steer-steer-1');
    placeholderAnchor?.setAttribute('tabindex', '-1');
    placeholderAnchor?.focus();

    view.rerender(windowedTree({ mode: 'bounded', start: 0, end: 2, heights }, root));

    expect(document.activeElement).toHaveAttribute('id', 'steer-steer-1');
    expect(document.activeElement).not.toHaveClass('sr-only');
  });

  it('does not reclaim placeholder focus after the user moves elsewhere', () => {
    const heights = new Map([[0, { messageId: 'm0', height: 120 }]]);
    const view = render(windowedTree({ mode: 'bounded', start: 1, end: 2, heights }));
    const placeholder = view.container.querySelector<HTMLElement>('#m0');
    if (placeholder) placeholder.tabIndex = -1;
    placeholder?.focus();
    const destination = document.createElement('button');
    document.body.appendChild(destination);
    destination.focus();

    view.rerender(windowedTree({ mode: 'bounded', start: 0, end: 2, heights }));

    expect(document.activeElement).toBe(destination);
  });

  it('keeps the row owning active speech playback mounted', () => {
    const heights = new Map([[0, { messageId: 'm0', height: 120 }]]);
    getDefaultStore().set(activeSpeechMessageIdAtom, 'm0');
    render(windowedTree({ mode: 'bounded', start: 1, end: 2, heights }));

    expect(screen.getAllByTestId('row').map((r) => r.textContent)).toContain('m0');
    act(() => getDefaultStore().set(activeSpeechMessageIdAtom, null));
  });

  it('keeps an interacted row mounted outside the visible window', () => {
    const heights = new Map([
      [0, { messageId: 'm0', height: 120 }],
      [1, { messageId: 'm1', height: 120 }],
      [2, { messageId: 'm2', height: 120 }],
    ]);
    render(
      windowedTree({
        mode: 'bounded',
        start: 1,
        end: 2,
        heights,
        pinnedRows: new Map([[0, 'm0']]),
      }),
    );

    expect(screen.getAllByTestId('row').map((row) => row.textContent)).toContain('m0');
  });

  it('pins a mounted row before its pointer interaction updates local state', () => {
    const pinRow = jest.fn();
    render(windowedTree({ mode: 'bounded', start: 0, end: 0, pinRow }));

    fireEvent.pointerDown(screen.getAllByTestId('prev')[0]);

    expect(pinRow).toHaveBeenCalledWith(0, 'm0');
  });

  it('keeps shortcut controls in the conversation tail mounted', () => {
    const heights = new Map([
      [0, { messageId: 'm0', height: 120 }],
      [1, { messageId: 'm1', height: 120 }],
      [2, { messageId: 'm2', height: 120 }],
    ]);
    render(windowedTree({ mode: 'bounded', start: 0, end: 0, tailStart: 1, heights }));

    expect(screen.getAllByTestId('row').map((row) => row.textContent)).toEqual(['m0', 'm1', 'm2']);
  });
});
