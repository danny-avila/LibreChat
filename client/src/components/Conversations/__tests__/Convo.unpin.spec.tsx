import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';

type PinVariables = { conversationId: string; pinned: boolean };
type PinOptions = { onSuccess?: () => void; onError?: () => void };

const pinCalls: Array<{ variables: PinVariables; options?: PinOptions }> = [];

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => false,
  useToastContext: () => ({ showToast: jest.fn() }),
  Spinner: () => <div data-testid="spinner" />,
  TooltipAnchor: ({ render: trigger }: { render: React.ReactNode }) => trigger,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNavigateToConvo: () => ({ navigateToConvo: jest.fn() }),
  useShiftKey: () => false,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { sharedLinksEnabled: false } }),
  useUpdateConversationMutation: () => ({ mutateAsync: jest.fn() }),
  usePinConversationMutation: () => ({
    mutate: (variables: PinVariables, options?: PinOptions) => {
      pinCalls.push({ variables, options });
    },
  }),
}));

jest.mock('react-router-dom', () => ({
  useParams: () => ({ conversationId: 'other-convo' }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => [],
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { allConversationsSelector: 'allConversationsSelector' },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
  logger: { error: jest.fn() },
  setDocumentTitle: jest.fn(),
}));

jest.mock('../ConvoOptions', () => ({
  ConvoOptions: () => <div data-testid="convo-options" />,
}));

jest.mock('../ConversationEndpointIcon', () => ({
  __esModule: true,
  default: () => <div data-testid="convo-icon" />,
}));

/** The real row's only focusable element is the link button inside it; the row
 *  element itself is a plain div, so a focus target has to be found in here. */
jest.mock('../ConvoLink', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => (
    <button type="button" aria-label={`open ${title}`}>
      {title}
    </button>
  ),
}));

jest.mock('../RenameForm', () => ({
  __esModule: true,
  default: () => <form data-testid="rename-form" />,
}));

import Conversation from '../Convo';

const pinned = (id: string, title: string) =>
  ({ conversationId: id, title, pinned: true }) as unknown as TConversation;

const renderPinnedSection = (conversations: TConversation[]) =>
  render(
    <DndProvider backend={HTML5Backend}>
      <div role="region" aria-label="com_ui_pinned">
        {conversations.map((conversation) => (
          <Conversation
            key={conversation.conversationId}
            conversation={conversation}
            retainView={jest.fn()}
            toggleNav={jest.fn()}
          />
        ))}
      </div>
    </DndProvider>,
  );

describe('pinned conversation row unpin', () => {
  let rafSpy: jest.SpyInstance;

  beforeEach(() => {
    pinCalls.length = 0;
    rafSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  it('unpins from the row badge without opening the options menu', () => {
    renderPinnedSection([pinned('c1', 'First'), pinned('c2', 'Second')]);

    fireEvent.click(screen.getAllByTestId('convo-unpin-button')[0]);

    expect(pinCalls).toHaveLength(1);
    expect(pinCalls[0].variables).toEqual({ conversationId: 'c1', pinned: false });
  });

  it('hands focus to a neighbouring row, not the row that is going away', () => {
    renderPinnedSection([pinned('c1', 'First'), pinned('c2', 'Second')]);

    fireEvent.click(screen.getAllByTestId('convo-unpin-button')[0]);
    act(() => {
      pinCalls[0].options?.onSuccess?.();
    });

    /* The unpinned row is still mounted at this point: focus has to skip it,
     * and land on something actually focusable rather than the row div. */
    expect(document.activeElement).toBe(screen.getByLabelText('open Second'));
  });

  it('falls back to the row above when the last row is unpinned', () => {
    renderPinnedSection([pinned('c1', 'First'), pinned('c2', 'Second')]);

    fireEvent.click(screen.getAllByTestId('convo-unpin-button')[1]);
    act(() => {
      pinCalls[0].options?.onSuccess?.();
    });

    expect(document.activeElement).toBe(screen.getByLabelText('open First'));
  });

  it('leaves focus alone when no other row survives', () => {
    renderPinnedSection([pinned('c1', 'Only')]);

    fireEvent.click(screen.getByTestId('convo-unpin-button'));
    act(() => {
      pinCalls[0].options?.onSuccess?.();
    });

    expect(document.activeElement).not.toBe(screen.getByLabelText('open Only'));
  });
});
