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
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveAttribute(
      'data-lpignore',
      'true',
    );
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveAttribute(
      'data-1p-ignore',
      'true',
    );
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toHaveAttribute(
      'data-lpignore',
      'true',
    );
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toHaveAttribute(
      'data-1p-ignore',
      'true',
    );
    expect(screen.queryByText('com_ui_langfuse_test')).not.toBeInTheDocument();
    expect(screen.getByText('com_ui_langfuse_status_not_configured')).toBeInTheDocument();
    expect(mockTest).not.toHaveBeenCalled();
  });

  it('prefills stored values, tests on load, and keeps toggle and destination editable', async () => {
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
    expect(screen.queryByText('com_ui_save')).not.toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_langfuse_destination')).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'com_ui_langfuse_title' })).toBeEnabled();
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

  it('tests a destination change immediately and saves without re-entering the secret', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
    mockTest.mockClear();

    await userEvent.selectOptions(screen.getByLabelText('com_ui_langfuse_destination'), 'us');

    expect(mockTest).toHaveBeenCalledTimes(1);
    expect(mockTest.mock.calls[0][0]).toMatchObject({
      destination: 'us',
      publicKey: 'pk-lf-1',
    });
    expect(mockTest.mock.calls[0][0]).not.toHaveProperty('secretKey');
    expect(screen.getByText('com_ui_langfuse_status_connected')).toBeInTheDocument();

    mockTest.mockClear();
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('secretKey');
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ destination: 'us', publicKey: 'pk-lf-1' });
  });

  it('opens each configured key independently when its masked value is clicked', async () => {
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
      screen.getByRole('button', {
        name: 'com_ui_edit com_ui_langfuse_public_key',
      }),
    );

    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveValue('pk-lf-1');
    expect(
      screen.queryByLabelText(/com_ui_langfuse_secret_key/, { selector: 'input' }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'com_ui_edit com_ui_langfuse_secret_key',
      }),
    );

    const secretKeyInput = screen.getByLabelText(/com_ui_langfuse_secret_key/);
    expect(secretKeyInput).toHaveValue('');
    expect(secretKeyInput.parentElement).toHaveClass('w-full');
    fireEvent.change(secretKeyInput, {
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

  it('restores the stored connection when editing is cancelled', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'eu',
        publicKey: 'pk-lf-original',
        displaySecretKey: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('switch', { name: 'com_ui_langfuse_title' }));
    await userEvent.selectOptions(screen.getByLabelText('com_ui_langfuse_destination'), 'us');
    await userEvent.click(
      screen.getByRole('button', {
        name: 'com_ui_edit com_ui_langfuse_public_key',
      }),
    );
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-edited' },
    });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'com_ui_edit com_ui_langfuse_secret_key',
      }),
    );
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-edited' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_cancel' }));

    expect(screen.getByRole('switch', { name: 'com_ui_langfuse_title' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'com_ui_langfuse_title' })).toBeEnabled();
    expect(screen.getByLabelText('com_ui_langfuse_destination')).toHaveValue('eu');
    expect(screen.getByText('pk-lf-...inal')).toBeInTheDocument();
    expect(screen.getByText('sk-lf-...515f')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_save')).not.toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
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

  it('replaces a connected status with a failure when an edited public key is rejected', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-valid',
        displaySecretKey: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(screen.getByText('com_ui_langfuse_status_connected')).toBeVisible());
    mockTest.mockClear();
    mockTest.mockImplementation((_payload, options) => {
      options?.onSuccess?.({
        success: false,
        message: 'Langfuse rejected these keys. Check the destination and keys',
      });
    });

    await userEvent.click(
      screen.getByRole('button', {
        name: 'com_ui_edit com_ui_langfuse_public_key',
      }),
    );
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-mangled' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).toHaveBeenCalledWith(
      expect.objectContaining({ publicKey: 'pk-lf-mangled' }),
      expect.any(Object),
    );
    expect(
      screen.getByText('Langfuse rejected these keys. Check the destination and keys'),
    ).toBeVisible();
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
