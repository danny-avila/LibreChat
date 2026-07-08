import userEvent from '@testing-library/user-event';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LangfuseConnection from '../LangfuseConnection';

const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockTest = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetLangfuseConnectionQuery: () => mockGet(),
  useUpdateLangfuseConnectionMutation: () => ({ mutate: mockUpdate, isLoading: false }),
  useTestLangfuseConnectionMutation: () => ({ mutate: mockTest, isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: jest.fn() }),
}));

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
  mockTest.mockReset();
  mockTest.mockImplementation((_payload, options) => {
    options?.onSuccess?.({ success: true });
  });
  mockGet.mockReturnValue({
    data: {
      configured: false,
      enabled: false,
      destinations: [
        { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
        { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
      ],
    },
  });
});

describe('LangfuseConnection', () => {
  it('renders the connection form fields', () => {
    render(<LangfuseConnection />);
    expect(screen.getByLabelText('com_ui_langfuse_destination')).toHaveValue('');
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toBeInTheDocument();
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toBeInTheDocument();
    expect(screen.queryByText('com_ui_langfuse_test')).not.toBeInTheDocument();
    expect(screen.getByText('com_ui_langfuse_status_not_configured')).toBeInTheDocument();
    expect(mockTest).not.toHaveBeenCalled();
  });

  it('prefills stored values, tests on load, and shows masked keys until edit', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'us',
        publicKey: 'pk-lf-12345678-515f',
        displaySecretKey: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);

    expect(screen.getByLabelText('com_ui_langfuse_destination')).toHaveValue('us');
    expect(screen.queryByLabelText('com_ui_langfuse_public_key')).not.toBeInTheDocument();
    expect(screen.getByText('pk-lf-...515f')).toBeInTheDocument();
    expect(screen.queryByLabelText('com_ui_langfuse_secret_key')).not.toBeInTheDocument();
    expect(screen.getByText('sk-lf-...515f')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_edit com_ui_langfuse_public_key' }),
    );
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveValue('pk-lf-12345678-515f');
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
    expect(mockTest.mock.calls[0][0]).toEqual({
      destination: 'us',
      publicKey: 'pk-lf-12345678-515f',
    });
    expect(screen.getByText('com_ui_langfuse_status_connected')).toBeInTheDocument();
  });

  it('shows a failed saved-connection status when the load-time test fails', async () => {
    mockTest.mockImplementation((_payload, options) => {
      options?.onSuccess?.({ success: false, message: 'Langfuse rejected these keys' });
    });
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...515f',
      },
    });

    render(<LangfuseConnection />);

    await waitFor(() =>
      expect(screen.getByText('Langfuse rejected these keys')).toBeInTheDocument(),
    );
    expect(screen.getByText('Langfuse rejected these keys').closest('div')).toHaveAttribute(
      'title',
      'com_ui_langfuse_status_failed_hover',
    );
  });

  it('tests and saves the typed secret key when enabling a new connection', async () => {
    render(<LangfuseConnection />);
    await userEvent.click(screen.getByRole('switch', { name: 'com_ui_langfuse_title' }));
    await userEvent.selectOptions(screen.getByLabelText('com_ui_langfuse_destination'), 'us');
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-1' },
    });
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-secret' },
    });

    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).toHaveBeenCalledTimes(1);
    expect(mockTest.mock.calls[0][0]).toEqual({
      destination: 'us',
      publicKey: 'pk-lf-1',
      secretKey: 'sk-lf-secret',
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual({
      enabled: true,
      destination: 'us',
      publicKey: 'pk-lf-1',
      secretKey: 'sk-lf-secret',
    });
  });

  it('shows the display secret key immediately after saving a new connection', async () => {
    mockUpdate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'us',
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...cret',
      });
    });

    render(<LangfuseConnection />);
    await userEvent.click(screen.getByRole('switch', { name: 'com_ui_langfuse_title' }));
    await userEvent.selectOptions(screen.getByLabelText('com_ui_langfuse_destination'), 'us');
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-1' },
    });
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-secret' },
    });

    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('com_ui_langfuse_secret_key')).not.toBeInTheDocument();
    expect(screen.getByText('sk-lf-...cret')).toBeInTheDocument();
  });

  it('tests and saves without re-entering the secret for an already-configured connection', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
    mockTest.mockClear();

    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).toHaveBeenCalledTimes(1);
    expect(mockTest.mock.calls[0][0]).toMatchObject({
      destination: 'eu',
      publicKey: 'pk-lf-1',
    });
    expect(mockTest.mock.calls[0][0]).not.toHaveProperty('secretKey');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('secretKey');
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ destination: 'eu', publicKey: 'pk-lf-1' });
  });

  it('shows the secret input only while replacing an already-configured secret', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
    mockTest.mockClear();

    expect(screen.queryByLabelText('com_ui_langfuse_secret_key')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_edit com_ui_langfuse_secret_key' }),
    );

    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toHaveValue('');
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-replacement' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).toHaveBeenCalledTimes(1);
    expect(mockTest.mock.calls[0][0]).toMatchObject({
      destination: 'eu',
      publicKey: 'pk-lf-1',
      secretKey: 'sk-lf-replacement',
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      destination: 'eu',
      publicKey: 'pk-lf-1',
      secretKey: 'sk-lf-replacement',
    });
  });

  it('blocks saving when the implicit connection test fails', async () => {
    mockTest.mockImplementation((_payload, options) => {
      options?.onSuccess?.({ success: false, message: 'bad key' });
    });
    render(<LangfuseConnection />);
    await userEvent.click(screen.getByRole('switch', { name: 'com_ui_langfuse_title' }));
    await userEvent.selectOptions(screen.getByLabelText('com_ui_langfuse_destination'), 'us');
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-1' },
    });
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-secret' },
    });

    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips the connection test when disabling an already-configured connection', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
    mockTest.mockClear();

    await userEvent.click(screen.getByRole('switch', { name: 'com_ui_langfuse_title' }));
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      enabled: false,
      destination: 'eu',
      publicKey: 'pk-lf-1',
    });
  });
});
