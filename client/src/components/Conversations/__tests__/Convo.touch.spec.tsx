import { render, screen, fireEvent } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';

let mockIsSmallScreen = true;
const mockConvoOptionsProps: { isPopoverActive: boolean }[] = [];

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => mockIsSmallScreen,
  useToastContext: () => ({ showToast: jest.fn() }),
  Spinner: () => <div data-testid="spinner" />,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNavigateToConvo: () => ({ navigateToConvo: jest.fn() }),
  useShiftKey: () => false,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { sharedLinksEnabled: false } }),
  useUpdateConversationMutation: () => ({ mutateAsync: jest.fn() }),
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
}));

jest.mock('../ConvoOptions', () => ({
  ConvoOptions: (props: { isPopoverActive: boolean }) => {
    mockConvoOptionsProps.push(props);
    return <div data-testid="convo-options" data-open={props.isPopoverActive} />;
  },
}));

jest.mock('../ConversationEndpointIcon', () => ({
  __esModule: true,
  default: () => <div data-testid="convo-icon" />,
}));

jest.mock('../ConvoLink', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <span>{title}</span>,
}));

jest.mock('../RenameForm', () => ({
  __esModule: true,
  default: () => <form data-testid="rename-form" />,
}));

import Conversation from '../Convo';

const conversation = {
  conversationId: 'convo-1',
  title: 'Mobile UI redesign',
} as TConversation;

const renderRow = () =>
  render(<Conversation conversation={conversation} retainView={jest.fn()} toggleNav={jest.fn()} />);

describe('Conversation row on touch', () => {
  beforeEach(() => {
    mockConvoOptionsProps.length = 0;
    mockIsSmallScreen = true;
  });

  it('offers a reachable overflow trigger without hover', () => {
    renderRow();

    expect(screen.getByTestId('convo-options-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('convo-options')).not.toBeInTheDocument();
  });

  it('opens the menu on the very first tap', () => {
    renderRow();

    /**
     * `pointerdown`, not `click`: touch focuses the button mid-tap, and the
     * row's `onFocus` swaps this trigger for `ConvoOptions` before a click
     * could land, so a click-based handler loses the first tap entirely.
     */
    fireEvent.pointerDown(screen.getByTestId('convo-options-trigger'));

    expect(screen.getByTestId('convo-options')).toHaveAttribute('data-open', 'true');
  });

  it('survives focus arriving before the press completes', () => {
    renderRow();

    const trigger = screen.getByTestId('convo-options-trigger');
    fireEvent.pointerDown(trigger);
    fireEvent.focus(trigger);

    expect(screen.getByTestId('convo-options')).toHaveAttribute('data-open', 'true');
  });

  it('opens from a click with no pointer event at all', () => {
    renderRow();

    /**
     * Assistive tech, voice control and keyboard activation dispatch `click`
     * directly. Without this path the click bubbles to the row and navigates
     * to the conversation instead of opening its options.
     */
    fireEvent.click(screen.getByTestId('convo-options-trigger'));

    expect(screen.getByTestId('convo-options')).toHaveAttribute('data-open', 'true');
  });

  it.each(['Enter', ' '])('opens on %s from the keyboard', (key) => {
    renderRow();

    fireEvent.keyDown(screen.getByTestId('convo-options-trigger'), { key });

    expect(screen.getByTestId('convo-options')).toHaveAttribute('data-open', 'true');
  });

  it('leaves the desktop hover reveal alone', () => {
    mockIsSmallScreen = false;
    renderRow();

    expect(screen.queryByTestId('convo-options-trigger')).not.toBeInTheDocument();
  });
});
