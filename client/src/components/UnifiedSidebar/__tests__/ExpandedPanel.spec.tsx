import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot } from 'recoil';
import { MessagesSquare, NotebookPen } from 'lucide-react';
import { ActivePanelProvider, DEFAULT_PANEL } from '~/Providers/ActivePanelContext';

const mockNewConversation = jest.fn();
const mockClearMessagesCache = jest.fn();

jest.mock('~/store', () => {
  const { atom } = jest.requireActual('recoil');
  let counter = 0;
  return {
    __esModule: true,
    default: {
      conversationByIndex: () =>
        atom({ key: `mock-conversationByIndex-${counter++}`, default: null }),
      newChatSwitchToHistory: atom({
        key: 'mock-newChatSwitchToHistory',
        default: true,
      }),
    },
  };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNewConvo: () => ({ newConversation: mockNewConversation }),
}));

jest.mock('~/utils', () => ({
  clearMessagesCache: (...args: unknown[]) => mockClearMessagesCache(...args),
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  CLOSE_SIDEBAR_ID: 'close-sidebar',
}));

jest.mock('~/components/Nav/AccountSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="account-settings" />,
}));

import ExpandedPanel from '../ExpandedPanel';

const createLinks = () => [
  {
    title: 'com_ui_chat_history' as const,
    icon: MessagesSquare,
    id: 'conversations',
  },
  {
    title: 'com_ui_prompts' as const,
    icon: NotebookPen,
    id: 'prompts',
  },
];

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPanel({
  expanded = true,
  onCollapse = jest.fn(),
  onExpand = jest.fn(),
  initialPanel = DEFAULT_PANEL,
}: {
  expanded?: boolean;
  onCollapse?: jest.Mock;
  onExpand?: jest.Mock;
  initialPanel?: string;
} = {}) {
  if (initialPanel !== DEFAULT_PANEL) {
    localStorage.setItem('side:active-panel', initialPanel);
  }

  const result = render(
    <QueryClientProvider client={createQueryClient()}>
      <RecoilRoot>
        <ActivePanelProvider>
          <ExpandedPanel
            links={createLinks()}
            expanded={expanded}
            onCollapse={onCollapse}
            onExpand={onExpand}
          />
        </ActivePanelProvider>
      </RecoilRoot>
    </QueryClientProvider>,
  );

  return { ...result, onCollapse, onExpand };
}

describe('ExpandedPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('NavIconButton collapse toggle', () => {
    it('collapses sidebar when clicking the active icon while expanded', () => {
      const { onCollapse } = renderPanel({ expanded: true });
      const activeButton = screen.getByRole('button', { name: 'com_ui_chat_history' });
      fireEvent.click(activeButton);
      expect(onCollapse).toHaveBeenCalledTimes(1);
    });

    it('does not collapse when clicking an inactive icon while expanded', () => {
      const { onCollapse } = renderPanel({ expanded: true });
      const inactiveButton = screen.getByRole('button', { name: 'com_ui_prompts' });
      fireEvent.click(inactiveButton);
      expect(onCollapse).not.toHaveBeenCalled();
    });

    it('expands sidebar when clicking any icon while collapsed', () => {
      const { onExpand } = renderPanel({ expanded: false });
      const activeButton = screen.getByRole('button', { name: 'com_ui_chat_history' });
      fireEvent.click(activeButton);
      expect(onExpand).toHaveBeenCalledTimes(1);
    });

    it('sets active panel and expands when clicking an inactive icon while collapsed', () => {
      const { onExpand } = renderPanel({ expanded: false });
      const inactiveButton = screen.getByRole('button', { name: 'com_ui_prompts' });
      fireEvent.click(inactiveButton);
      expect(onExpand).toHaveBeenCalledTimes(1);
    });
  });

  describe('NewChatButton panel switch', () => {
    it('switches to chat history panel on new chat click', () => {
      renderPanel({ expanded: true, initialPanel: 'prompts' });

      const newChatLink = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatLink);

      expect(mockNewConversation).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBe(DEFAULT_PANEL);
    });

    it('calls newConversation regardless of panel switch setting', () => {
      renderPanel({ expanded: true });

      const newChatLink = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatLink);

      expect(mockNewConversation).toHaveBeenCalledTimes(1);
    });
  });
});
