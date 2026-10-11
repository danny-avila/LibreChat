import React from 'react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { QueryKeys } from 'librechat-data-provider';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TPullRequestConnection, TStartupConfig } from 'librechat-data-provider';
import ConnectedAccounts from '../ConnectedAccounts';

const mockGetConnection = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockStartup: { current: Partial<TStartupConfig> | undefined } = {
  current: { pullRequestsConnect: 'github' },
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string | number>) =>
    values == null ? key : `${key}:${Object.values(values).join(',')}`,
}));

jest.mock('~/data-provider/Endpoints', () => ({
  ...jest.requireActual('~/data-provider/Endpoints'),
  useGetStartupConfig: () => ({ data: mockStartup.current }),
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getPullRequestConnection: (...args: unknown[]) => mockGetConnection(...args),
      connectPullRequestAccount: (...args: unknown[]) => mockConnect(...args),
      disconnectPullRequestAccount: (...args: unknown[]) => mockDisconnect(...args),
    },
  };
});

const connection = (connected: boolean): TPullRequestConnection => ({
  configured: true,
  provider: 'github',
  connected,
});

/** Rejections are part of these tests; keep React Query from logging each one. */
const logger = { log: () => undefined, warn: () => undefined, error: () => undefined };

const renderRow = () => {
  const client = new QueryClient({ logger, defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <ConnectedAccounts />
    </QueryClientProvider>,
  );
  return { client, invalidate };
};

const fakeWindow = () => ({ opener: {} as unknown, location: { href: '' }, close: jest.fn() });

describe('ConnectedAccounts', () => {
  let openSpy: jest.SpyInstance;

  beforeEach(() => {
    mockStartup.current = { pullRequestsConnect: 'github' };
    mockGetConnection.mockReset();
    mockConnect.mockReset();
    mockDisconnect.mockReset();
    openSpy = jest.spyOn(window, 'open');
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('renders nothing and asks nothing when the deployment offers no account to connect', () => {
    mockStartup.current = {};
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ logger })}>
        <ConnectedAccounts />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockGetConnection).not.toHaveBeenCalled();
  });

  it('renders nothing once the server says no app is configured', async () => {
    mockGetConnection.mockResolvedValue({ configured: false, connected: false });
    renderRow();
    await waitFor(() => expect(mockGetConnection).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a checking status and no action while the connection loads', () => {
    mockGetConnection.mockReturnValue(new Promise(() => undefined));
    renderRow();
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_pr_account_checking');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('connects through a window opened in the click, then sends it to the sign-in page', async () => {
    const popup = fakeWindow();
    openSpy.mockReturnValue(popup as unknown as Window);
    mockGetConnection.mockResolvedValue(connection(false));
    mockConnect.mockResolvedValue({ url: 'https://github.com/login/oauth/authorize?x=1' });
    renderRow();

    const button = await screen.findByRole('button', {
      name: 'com_ui_pr_account_connect_aria:com_ui_pr_provider_github',
    });
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_pr_account_not_connected');
    await userEvent.click(button);

    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(popup.opener).toBeNull();
    expect(mockConnect).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(popup.location.href).toBe('https://github.com/login/oauth/authorize?x=1'),
    );
    expect(popup.close).not.toHaveBeenCalled();
  });

  it('closes the opened window and explains when the connection cannot start', async () => {
    const popup = fakeWindow();
    openSpy.mockReturnValue(popup as unknown as Window);
    mockGetConnection.mockResolvedValue(connection(false));
    mockConnect.mockRejectedValue(new Error('500'));
    renderRow();

    await userEvent.click(
      await screen.findByRole('button', { name: /com_ui_pr_account_connect_aria/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('com_ui_pr_account_connect_error');
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(popup.location.href).toBe('');
  });

  it('does not start the flow when the browser blocks the window', async () => {
    openSpy.mockReturnValue(null);
    mockGetConnection.mockResolvedValue(connection(false));
    renderRow();

    await userEvent.click(
      await screen.findByRole('button', { name: /com_ui_pr_account_connect_aria/ }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('com_ui_pr_account_popup_blocked');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('asks before disconnecting, then disconnects and refreshes pull requests', async () => {
    mockGetConnection.mockResolvedValue(connection(true));
    mockDisconnect.mockResolvedValue(undefined);
    const { invalidate } = renderRow();

    const trigger = await screen.findByRole('button', {
      name: 'com_ui_pr_account_disconnect_aria:com_ui_pr_provider_github',
    });
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_pr_account_connected');
    await userEvent.click(trigger);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'com_ui_pr_account_disconnect_title:com_ui_pr_provider_github',
    );
    expect(mockDisconnect).not.toHaveBeenCalled();

    mockGetConnection.mockResolvedValue(connection(false));
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_pr_account_disconnect' }));

    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.pullRequestConnection]);
    expect(invalidate).toHaveBeenCalledWith([QueryKeys.conversationPullRequest]);
    const connect = await screen.findByRole('button', { name: /com_ui_pr_account_connect_aria/ });
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_pr_account_not_connected');
    await waitFor(() => expect(connect).toHaveFocus());
  });

  it('keeps the confirmation open with an error when disconnecting fails', async () => {
    mockGetConnection.mockResolvedValue(connection(true));
    mockDisconnect.mockRejectedValue(new Error('500'));
    renderRow();

    await userEvent.click(
      await screen.findByRole('button', { name: /com_ui_pr_account_disconnect_aria/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'com_ui_pr_account_disconnect' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'com_ui_pr_account_disconnect_error',
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('explains a failed status check and retries it', async () => {
    mockGetConnection.mockRejectedValueOnce(new Error('500'));
    renderRow();

    const retry = await screen.findByRole('button', { name: 'com_ui_retry' });
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_pr_account_status_error');

    mockGetConnection.mockResolvedValueOnce(connection(true));
    await userEvent.click(retry);

    expect(
      await screen.findByRole('button', { name: /com_ui_pr_account_disconnect_aria/ }),
    ).toBeInTheDocument();
    expect(mockGetConnection).toHaveBeenCalledTimes(2);
  });
});
