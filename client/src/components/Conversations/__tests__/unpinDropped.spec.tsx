import { renderHook, waitFor } from '@testing-library/react';
import type {
  AssignDroppedConversation,
  ConversationDragItem,
  UnpinDroppedConversation,
} from '../dnd';
import { useAssignDroppedConversation, useUnpinDroppedConversation } from '../dnd';

const mockPin = jest.fn();
const mockAssign = jest.fn();

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

let mockPendingAssignment: { token: number; projectId: string | null } | undefined;

jest.mock('~/data-provider/Projects/mutations', () => ({
  getPendingAssignment: () => mockPendingAssignment,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ getQueryData: () => undefined }),
}));

jest.mock('~/data-provider', () => ({
  useAssignConversationToProjectMutation: () => ({ mutateAsync: mockAssign }),
  usePinConversationMutation: () => ({ mutate: mockPin }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const item = (pinned: boolean, conversationId = 'c1'): ConversationDragItem => ({
  conversationId,
  chatProjectId: null,
  pinned,
});

/* Dropping a chat on the Chats section asks for an ordinary chat, and a pinned
 * one is not that. */
describe('useUnpinDroppedConversation', () => {
  beforeEach(() => {
    mockPin.mockReset();
    mockAssign.mockReset();
  });

  it('unpins the dropped conversation', () => {
    const { result } = renderHook(() => useUnpinDroppedConversation());

    result.current(item(true));

    expect(mockPin).toHaveBeenCalledWith(
      { conversationId: 'c1', pinned: false },
      expect.anything(),
    );
  });

  it('leaves a chat that is not pinned alone', () => {
    const { result } = renderHook(() => useUnpinDroppedConversation());

    result.current(item(false));

    expect(mockPin).not.toHaveBeenCalled();
  });

  /* A favorite row's drag item carries no conversation at all. */
  it('ignores a drag item with no conversation', () => {
    const { result } = renderHook(() => useUnpinDroppedConversation());

    result.current(item(true, ''));

    expect(mockPin).not.toHaveBeenCalled();
  });
});

/* What the Chats section does with a chat that is both pinned and filed in a
 * project: it asks for both halves, and the caller decides their order. */
describe('a drop on Chats, filing and unpinning together', () => {
  beforeEach(() => {
    mockPin.mockReset();
    mockAssign.mockReset();
    mockPendingAssignment = undefined;
  });

  /* The drop handler the Chats section installs, kept in one place so the two
   * cases below exercise the same sequence the component runs. */
  const drop = async (
    assign: AssignDroppedConversation,
    unpin: UnpinDroppedConversation,
    dragged: ConversationDragItem,
  ) => {
    const filed = await assign(dragged, null);
    if (filed) {
      unpin(dragged);
    }
  };

  it('unpins only once the project write has landed', async () => {
    let settle: (() => void) | undefined;
    mockAssign.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const { result } = renderHook(() => ({
      assign: useAssignDroppedConversation(),
      unpin: useUnpinDroppedConversation(),
    }));

    const dropped = { conversationId: 'c1', chatProjectId: 'p1', pinned: true };
    const running = drop(result.current.assign, result.current.unpin, dropped);

    expect(mockAssign).toHaveBeenCalledWith({ conversationId: 'c1', projectId: null });
    expect(mockPin).not.toHaveBeenCalled();

    settle?.();
    await running;

    expect(mockPin).toHaveBeenCalledWith(
      { conversationId: 'c1', pinned: false },
      expect.anything(),
    );
  });

  /* A chat left in its project must not also leave the Pinned section: the row
   * would then be in neither place the user can see it. */
  it('keeps the chat pinned when the project write fails', async () => {
    mockAssign.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => ({
      assign: useAssignDroppedConversation(),
      unpin: useUnpinDroppedConversation(),
    }));

    await drop(result.current.assign, result.current.unpin, {
      conversationId: 'c1',
      chatProjectId: 'p1',
      pinned: true,
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalled());
    expect(mockPin).not.toHaveBeenCalled();
  });

  /* Dropping the same chat again while its first assignment is still in flight
   * asks a question the pending write cannot answer yet: that write can still
   * fail, and the drop that started it already owns the unpin. Treating its
   * destination as an outcome is what unpinned a chat that stayed in its
   * project. */
  it('does not unpin again while an assignment to the same place is in flight', async () => {
    mockPendingAssignment = { token: 1, projectId: null };
    const { result } = renderHook(() => ({
      assign: useAssignDroppedConversation(),
      unpin: useUnpinDroppedConversation(),
    }));

    await drop(result.current.assign, result.current.unpin, {
      conversationId: 'c1',
      chatProjectId: 'p1',
      pinned: true,
    });

    expect(mockAssign).not.toHaveBeenCalled();
    expect(mockPin).not.toHaveBeenCalled();
  });
});
