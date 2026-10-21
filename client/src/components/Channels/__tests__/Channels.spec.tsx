import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { dataService } from 'librechat-data-provider';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Settings from '../Settings';
import Link from '../Link';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ isAuthenticated: true, isAuthReady: true }),
  useLocalize: () => (key: string) => key,
}));
function mount(children: ReactNode, path = '/channels') {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => jest.restoreAllMocks());
it('shows loading and an empty connection list', async () => {
  jest.spyOn(dataService, 'getChannels').mockResolvedValue({ connections: [] });
  jest.spyOn(dataService, 'listAgents').mockResolvedValue({
    data: [],
    has_more: false,
    after: undefined,
    object: 'list',
    first_id: '',
    last_id: '',
  });
  mount(<Settings />);
  expect(screen.getByRole('status')).toHaveTextContent('com_ui_loading');
  expect(await screen.findByText('com_channels_empty')).toBeVisible();
});
it('shows a safe error when loading connections fails', async () => {
  jest.spyOn(dataService, 'getChannels').mockRejectedValue(new Error('private backend detail'));
  mount(<Settings />);
  expect(await screen.findByRole('alert')).toHaveTextContent('com_channels_error');
  expect(screen.queryByText('private backend detail')).not.toBeInTheDocument();
});
it('exposes check, enable, and unlink as separate operations', async () => {
  jest.spyOn(dataService, 'getChannels').mockResolvedValue({
    connections: [
      {
        id: 'connection',
        agentId: 'agent',
        name: 'Agent',
        appId: 'A123',
        teamId: 'T123',
        botUserId: 'UBOT',
        mode: 'http',
        enabled: false,
        linked: true,
        editable: true,
      },
    ],
  });
  jest.spyOn(dataService, 'listAgents').mockResolvedValue({
    data: [],
    has_more: false,
    after: undefined,
    object: 'list',
    first_id: '',
    last_id: '',
  });
  const check = jest.spyOn(dataService, 'checkChannel').mockResolvedValue({ connected: true });
  const enable = jest.spyOn(dataService, 'enableChannel').mockResolvedValue({ enabled: true });
  const unlink = jest.spyOn(dataService, 'unlinkChannel').mockResolvedValue({ unlinked: true });
  const user = userEvent.setup();
  mount(<Settings />);
  await user.click(await screen.findByRole('button', { name: 'com_channels_check' }));
  await waitFor(() => expect(check).toHaveBeenCalledWith('connection'));
  expect(enable).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'com_channels_enable' }));
  await waitFor(() => expect(enable).toHaveBeenCalledWith('connection'));
  await user.click(screen.getByRole('button', { name: 'com_channels_unlink' }));
  await waitFor(() => expect(unlink).toHaveBeenCalledWith('connection'));
});
it('rejects malformed links before making an API request', () => {
  const load = jest.spyOn(dataService, 'getChannelLink');
  mount(<Link />, '/channels/link?token=bad');
  expect(screen.getByRole('alert')).toHaveTextContent('com_channels_link_expired');
  expect(load).not.toHaveBeenCalled();
});
it('shows link identity, handles a rejected code, and permits correction', async () => {
  jest
    .spyOn(dataService, 'getChannelLink')
    .mockResolvedValue({ name: 'Agent', teamId: 'T123', senderId: 'UATEF' });
  const confirm = jest
    .spyOn(dataService, 'confirmChannelLink')
    .mockRejectedValueOnce(new Error('invalid code'))
    .mockResolvedValueOnce({ linked: true });
  const user = userEvent.setup();
  const token = 'a'.repeat(64);
  mount(<Link />, `/channels/link?token=${token}`);
  const input = await screen.findByLabelText('com_channels_code');
  await user.type(input, 'b'.repeat(16));
  await user.click(screen.getByRole('button', { name: 'com_channels_confirm' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('com_channels_link_invalid');
  await user.clear(input);
  await user.type(input, 'c'.repeat(16));
  await user.click(screen.getByRole('button', { name: 'com_channels_confirm' }));
  expect(await screen.findByRole('status')).toHaveTextContent('com_channels_linked');
  expect(confirm).toHaveBeenLastCalledWith({ token, code: 'c'.repeat(16) });
});

it('requires sign-in again when the linked server session is missing', async () => {
  jest.spyOn(dataService, 'getChannelLink').mockResolvedValue({
    name: 'Agent',
    teamId: 'T123',
    senderId: 'UATEF',
    reauthUrl: 'https://librechat.example/oauth/openid?prompt=login',
  });
  mount(<Link />, `/channels/link?token=${'a'.repeat(64)}`);
  expect(await screen.findByRole('link', { name: 'com_channels_sign_in_again' })).toHaveAttribute(
    'href',
    'https://librechat.example/oauth/openid?prompt=login',
  );
  expect(screen.queryByLabelText('com_channels_code')).not.toBeInTheDocument();
});
