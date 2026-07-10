import userEvent from '@testing-library/user-event';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LangfuseConnection from '../LangfuseConnection';

const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockTest = jest.fn();
const destinationLabels = {
  eu: 'eu - https://cloud.langfuse.com',
  us: 'us - https://us.cloud.langfuse.com',
};

async function selectDestination(destination: keyof typeof destinationLabels) {
  await userEvent.click(screen.getByTestId('langfuse-destination'));
  await userEvent.click(screen.getByRole('option', { name: destinationLabels[destination] }));
}

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
  global.ResizeObserver = class MockedResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  };
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
    expect(screen.getByTestId('langfuse-destination')).toHaveTextContent('com_ui_select');
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveAttribute(
      'data-lpignore',
      'true',
    );
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveAttribute(
      'data-1p-ignore',
      'true',
    );
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveAttribute(
      'data-form-type',
      'other',
    );
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveAttribute(
      'data-bwignore',
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
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toHaveAttribute(
      'data-form-type',
      'other',
    );
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toHaveAttribute(
      'data-bwignore',
      'true',
    );
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toHaveAttribute(
      'autocomplete',
      'off',
    );
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toHaveAttribute('type', 'text');
    expect(screen.queryByRole('button', { name: 'Show secret' })).not.toBeInTheDocument();
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

    expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(destinationLabels.us);
    expect(screen.queryByLabelText('com_ui_langfuse_public_key')).not.toBeInTheDocument();
    expect(screen.getByText('pk-lf-...515f')).toBeInTheDocument();
    expect(screen.queryByLabelText('com_ui_langfuse_secret_key')).not.toBeInTheDocument();
    expect(screen.getByText('sk-lf-...515f')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_save')).not.toBeInTheDocument();
    expect(screen.getByTestId('langfuse-destination')).toBeEnabled();
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
    await selectDestination('us');
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
    await selectDestination('us');
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

    await selectDestination('us');

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
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveFocus();
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
    expect(secretKeyInput).toHaveClass('w-full');
    expect(secretKeyInput).toHaveFocus();
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

    await selectDestination('us');
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
    expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(destinationLabels.eu);
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
    await selectDestination('us');
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

  it('saves immediately without testing when disabling a configured connection', async () => {
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
    mockUpdate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({
        configured: true,
        enabled: false,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...515f',
        updatedAt: '2026-07-10T15:30:00.000Z',
      });
    });

    await userEvent.click(screen.getByRole('switch', { name: 'com_ui_langfuse_title' }));

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      enabled: false,
      destination: 'eu',
      publicKey: 'pk-lf-1',
    });
    expect(screen.queryByText('com_ui_save')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'com_ui_langfuse_title' })).not.toBeChecked();
  });

  it('saves immediately without testing when enabling a configured connection', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: false,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...515f',
      },
    });
    mockUpdate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...515f',
        updatedAt: '2026-07-10T15:31:00.000Z',
      });
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
    mockTest.mockClear();

    await userEvent.click(screen.getByRole('switch', { name: 'com_ui_langfuse_title' }));

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      { enabled: true, destination: 'eu', publicKey: 'pk-lf-1' },
      expect.any(Object),
    );
    expect(screen.queryByText('com_ui_save')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'com_ui_langfuse_title' })).toBeChecked();
  });
});
