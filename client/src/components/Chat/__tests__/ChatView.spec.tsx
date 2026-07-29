import React from 'react';
import 'test/matchMedia.mock';
import '@testing-library/jest-dom';
import { RecoilRoot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChatView from '../ChatView';

const mockParams = jest.fn();
const mockConversation = jest.fn();

/** ChatView needs Recoil and a router; auth is deliberately out of scope here. */
const render = (ui: React.ReactElement) =>
  rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={new QueryClient()}>
        <RecoilRoot>
          <MemoryRouter>{children}</MemoryRouter>
        </RecoilRoot>
      </QueryClientProvider>
    ),
  });

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams(),
}));

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({ data: null, isLoading: false, isFetching: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => (key === 'com_ui_new_chat' ? 'New chat' : key),
  useChatHelpers: () => ({ conversation: mockConversation() }),
  useAddedResponse: () => ({}),
  useAdaptiveSSE: jest.fn(),
  useResumeOnLoad: jest.fn(),
  useQueueDrain: jest.fn(),
}));

jest.mock('../Presentation', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../Header', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../Footer', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../Landing', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../ProjectLandingChip', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../Messages/MessagesView', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../Input/ChatForm', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../Input/ConversationStarters', () => ({ __esModule: true, default: () => <div /> }));

describe('ChatView page heading', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({});
    mockConversation.mockReturnValue(null);
  });

  test('exposes a single h1 to assistive technology', () => {
    render(<ChatView />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
  });

  test('keeps the heading visually hidden', () => {
    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only');
  });

  test('announces a localized new chat heading on the landing page', () => {
    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1, name: 'New chat' })).toBeInTheDocument();
  });

  test('uses the conversation title once a conversation is open', () => {
    mockParams.mockReturnValue({ conversationId: 'convo-1' });
    mockConversation.mockReturnValue({ conversationId: 'convo-1', title: 'Deploy checklist' });

    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1, name: 'Deploy checklist' })).toBeInTheDocument();
  });

  test('falls back to the localized heading when a title is blank', () => {
    mockParams.mockReturnValue({ conversationId: 'convo-1' });
    mockConversation.mockReturnValue({ conversationId: 'convo-1', title: '   ' });

    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1, name: 'New chat' })).toBeInTheDocument();
  });

  test('prefers the localized heading over a stale title on the landing page', () => {
    mockConversation.mockReturnValue({ conversationId: 'new', title: 'New Chat' });

    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1, name: 'New chat' })).toBeInTheDocument();
  });
});
