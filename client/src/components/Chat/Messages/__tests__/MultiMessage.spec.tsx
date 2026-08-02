import React from 'react';
import { RecoilRoot } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';
import MultiMessage from '../MultiMessage';

type RowProps = {
  message: TMessage;
  siblingIdx?: number;
  setSiblingIdx?: (value: number) => void;
};

/** Row stub exposing the sibling switcher contract (display-order index). */
const createRowStub = () => {
  const { createElement } = jest.requireActual<typeof React>('react');
  return ({ message, siblingIdx = 0, setSiblingIdx }: RowProps) =>
    createElement(
      'div',
      null,
      createElement('div', { 'data-testid': 'row' }, message.messageId),
      createElement(
        'button',
        { 'data-testid': 'prev', onClick: () => setSiblingIdx?.(siblingIdx - 1) },
        'prev',
      ),
    );
};

jest.mock('~/components/Messages/MessageContent', () => ({
  __esModule: true,
  default: createRowStub(),
}));
jest.mock('../MessageParts', () => ({ __esModule: true, default: createRowStub() }));
jest.mock('../Message', () => ({ __esModule: true, default: createRowStub() }));

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
