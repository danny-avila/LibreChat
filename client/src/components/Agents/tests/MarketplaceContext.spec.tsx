import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketplaceProvider, useMarketplaceHost } from '../MarketplaceContext';
import { useChatContext } from '~/Providers';

const mockClearAllConversations = jest.fn();
const mockClearMessagesCache = jest.fn();

jest.mock('~/hooks', () => ({
  useChatHelpers: jest.fn(),
}));

jest.mock('~/utils/messages', () => ({
  clearMessagesCache: (...args: unknown[]) => mockClearMessagesCache(...args),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { useClearConvoState: () => mockClearAllConversations },
}));

const chatHelpers = {
  conversation: {
    endpoint: EModelEndpoint.agents,
    conversationId: 'marketplace',
    title: 'Agent Marketplace',
  },
};

const START_LABEL = 'start';

/** Reads both halves of what the provider hands the marketplace: the chat context
 *  the side panel consumes, and the host action the detail dialog asks for. */
const Consumer: React.FC = () => {
  const context = useChatContext();
  const { resetNewConversation } = useMarketplaceHost();

  return (
    <div>
      <span data-testid="conversation-id">{context.conversation?.conversationId}</span>
      <button type="button" aria-label={START_LABEL} onClick={resetNewConversation} />
    </div>
  );
};

const renderProvider = (children: React.ReactNode = <Consumer />) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MarketplaceProvider>{children}</MarketplaceProvider>
    </QueryClientProvider>,
  );
};

describe('MarketplaceProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useChatHelpers } = require('~/hooks');
    (useChatHelpers as jest.Mock).mockReturnValue(chatHelpers);
  });

  it('hands the marketplace the chat context its panels read', () => {
    renderProvider();

    expect(screen.getByTestId('conversation-id')).toHaveTextContent('marketplace');
  });

  it('drops the open conversations and the new-chat transcript when the host is asked to reset', async () => {
    const user = userEvent.setup();
    renderProvider();

    await user.click(screen.getByRole('button', { name: START_LABEL }));

    /* `true` clears every parallel conversation a multi-conversation session left open,
       not just the active one, so an agent started from a card is a new conversation
       rather than another column beside them. */
    expect(mockClearAllConversations).toHaveBeenCalledWith(true);
    expect(mockClearMessagesCache).toHaveBeenCalledWith(expect.anything(), Constants.NEW_CONVO);
  });

  it('refuses to serve the host action outside the provider', () => {
    const HostOnly: React.FC = () => {
      useMarketplaceHost();
      return null;
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    /* A no-op default would leave the previous conversations open on every start-chat,
       which is the bug the reset exists to prevent — so the hook throws instead. */
    expect(() => render(<HostOnly />)).toThrow(/MarketplaceProvider/);
    consoleError.mockRestore();
  });
});
