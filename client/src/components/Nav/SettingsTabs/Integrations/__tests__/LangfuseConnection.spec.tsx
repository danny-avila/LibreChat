import userEvent from '@testing-library/user-event';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import LangfuseConnection from '../LangfuseConnection';

const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockTest = jest.fn();
const mockRefetch = jest.fn();
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
  mockRefetch.mockReset();
  mockTest.mockImplementation((_payload, options) => {
    options?.onSuccess?.({ success: true });
  });
  mockGet.mockReturnValue({
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: mockRefetch,
    data: {
      configured: false,
      enabled: false,
      configActive: true,
      configVersion: null,
      effectiveTenantId: 'tenant-a',
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
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show secret' })).toBeInTheDocument();
    expect(screen.queryByText('com_ui_langfuse_test')).not.toBeInTheDocument();
    expect(screen.getByText('com_ui_langfuse_status_not_configured')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_ui_cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_save' })).toHaveClass('bg-surface-submit');
    expect(screen.getByTestId('langfuse-connection-status')).toHaveTextContent(
      'com_ui_langfuse_status_not_configured',
    );
    expect(screen.queryByText('com_ui_langfuse_description')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_more_info' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'com_ui_langfuse_enable' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'com_ui_langfuse_disable' }),
    ).not.toBeInTheDocument();
    expect(mockTest).not.toHaveBeenCalled();
  });

  it('renders a loading state while the stored connection is loading', () => {
    mockGet.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: true,
      refetch: mockRefetch,
    });

    render(<LangfuseConnection />);

    expect(screen.getByTestId('langfuse-connection-loading')).toBeVisible();
    expect(screen.getByText('com_ui_loading')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_langfuse_status_not_configured')).not.toBeInTheDocument();
  });

  it('opens the connection explanation when the help button is clicked', async () => {
    render(<LangfuseConnection />);

    expect(screen.queryByText('com_ui_langfuse_description')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_more_info' }));

    expect(await screen.findByText('com_ui_langfuse_beta_info')).toBeVisible();
  });

  it('renders a retryable error when the stored connection cannot be loaded', async () => {
    mockGet.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
    });

    render(<LangfuseConnection />);

    expect(screen.getByText('com_ui_langfuse_load_error')).toBeVisible();
    expect(screen.queryByText('com_ui_langfuse_status_not_configured')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      credential: 'public key',
      editButton: 'com_ui_edit com_ui_langfuse_public_key',
      inputLabel: 'com_ui_langfuse_public_key',
      value: 'pk-lf-updated',
    },
    {
      credential: 'secret key',
      editButton: 'com_ui_edit com_ui_langfuse_secret_key',
      inputLabel: 'com_ui_langfuse_secret_key',
      value: 'sk-lf-updated',
    },
  ])(
    'keeps edited $credential unverified when an earlier automatic test completes',
    async ({ editButton, inputLabel, value }) => {
      let completeTest: ((result: { success: boolean }) => void) | undefined;
      mockTest.mockImplementation((_payload, options) => {
        completeTest = options?.onSuccess;
      });
      mockGet.mockReturnValue({
        data: {
          configured: true,
          enabled: true,
          destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
          destination: 'eu',
          publicKey: 'pk-lf-original',
          secretKeyPreview: 'sk-lf-...inal',
        },
      });

      render(<LangfuseConnection />);
      await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
      await userEvent.click(screen.getByRole('button', { name: editButton }));
      fireEvent.change(screen.getByLabelText(inputLabel), { target: { value } });

      expect(screen.getByText('com_ui_langfuse_status_not_verified')).toBeVisible();
      act(() => completeTest?.({ success: true }));
      expect(screen.getByText('com_ui_langfuse_status_not_verified')).toBeVisible();
      expect(screen.queryByText('com_ui_langfuse_status_connected')).not.toBeInTheDocument();
    },
  );

  it('prefills stored values, tests on load, and keeps destination editable', async () => {
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
        secretKeyPreview: 'sk-lf-...515f',
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
    expect(screen.getByRole('button', { name: 'com_ui_langfuse_disable' })).toBeEnabled();
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
    expect(mockTest.mock.calls[0][0]).toEqual({
      destination: 'us',
      publicKey: 'pk-lf-12345678-515f',
    });
    expect(screen.getByText('com_ui_langfuse_status_connected')).toBeInTheDocument();
  });

  it('shows a failed saved-connection status when the load-time test fails', async () => {
    mockTest.mockImplementation((_payload, options) => {
      options?.onSuccess?.({ success: false, errorCode: 'invalid_credentials' });
    });
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
      },
    });

    render(<LangfuseConnection />);

    await waitFor(() =>
      expect(screen.getByText('com_ui_langfuse_test_invalid_credentials')).toBeInTheDocument(),
    );
    expect(
      screen.getByText('com_ui_langfuse_test_invalid_credentials').closest('div'),
    ).toHaveAttribute('title', 'com_ui_langfuse_status_failed_hover');
  });

  it('saves the typed secret key without a duplicate preflight test', async () => {
    render(<LangfuseConnection />);
    await selectDestination('us');
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-1' },
    });
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-secret' },
    });

    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual({
      enabled: true,
      destination: 'us',
      publicKey: 'pk-lf-1',
      secretKey: 'sk-lf-secret',
      expectedVersion: null,
      expectedTenantId: 'tenant-a',
    });
  });

  it('shows the display secret key immediately after saving a new connection', async () => {
    mockUpdate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({
        configured: true,
        enabled: true,
        configActive: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'us',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...cret',
        configVersion: 1,
        effectiveTenantId: 'tenant-a',
      });
    });

    render(<LangfuseConnection />);
    await selectDestination('us');
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-1' },
    });
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-secret' },
    });

    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('com_ui_langfuse_secret_key')).not.toBeInTheDocument();
    expect(screen.getByText('sk-lf-...cret')).toBeInTheDocument();
  });

  it('requires secret re-entry before saving a destination change', async () => {
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
        secretKeyPreview: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
    mockTest.mockClear();

    await selectDestination('us');

    expect(mockTest).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toBeVisible();
    expect(screen.getByText('com_ui_langfuse_status_not_verified')).toBeInTheDocument();
    expect(screen.getByText('com_ui_save')).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-replacement' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      destination: 'us',
      publicKey: 'pk-lf-1',
      secretKey: 'sk-lf-replacement',
    });
  });

  it('opens each configured key independently when its masked value is clicked', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
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

    expect(screen.queryByRole('button', { name: 'com_ui_cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_save' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'com_ui_langfuse_disable' }),
    ).not.toBeInTheDocument();
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

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      destination: 'eu',
      publicKey: 'pk-lf-1',
      secretKey: 'sk-lf-replacement',
    });
  });

  it('preserves a disabled connection when saving edited credentials', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: false,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await userEvent.click(
      screen.getByRole('button', {
        name: 'com_ui_edit com_ui_langfuse_public_key',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(mockUpdate).toHaveBeenCalledWith(
      {
        enabled: false,
        destination: 'eu',
        publicKey: 'pk-lf-1',
        expectedVersion: null,
        expectedTenantId: '',
      },
      expect.any(Object),
    );
  });

  it('shows a save failure when mandatory server verification rejects the connection', async () => {
    mockUpdate.mockImplementation((_payload, options) => {
      options?.onError?.();
    });
    render(<LangfuseConnection />);
    await selectDestination('us');
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-1' },
    });
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-secret' },
    });

    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('com_ui_langfuse_save_error')).toBeVisible();
  });

  it('replaces a connected status with a failure when an edited public key is rejected', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-valid',
        secretKeyPreview: 'sk-lf-...515f',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(screen.getByText('com_ui_langfuse_status_connected')).toBeVisible());
    mockTest.mockClear();
    mockUpdate.mockImplementation((_payload, options) => {
      options?.onError?.();
    });

    await userEvent.click(
      screen.getByRole('button', {
        name: 'com_ui_edit com_ui_langfuse_public_key',
      }),
    );
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-mangled' },
    });
    expect(screen.getByText('com_ui_langfuse_status_not_verified')).toBeVisible();
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-replacement' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: 'pk-lf-mangled',
        secretKey: 'sk-lf-replacement',
      }),
      expect.any(Object),
    );
    expect(screen.getByText('com_ui_langfuse_save_error')).toBeVisible();
  });

  it('saves immediately without testing when disabling a configured connection', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
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
        secretKeyPreview: 'sk-lf-...515f',
        updatedAt: '2026-07-10T15:30:00.000Z',
      });
    });

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_langfuse_disable' }));

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      enabled: false,
      destination: 'eu',
      publicKey: 'pk-lf-1',
    });
    expect(screen.queryByText('com_ui_save')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_langfuse_enable' })).toBeEnabled();
  });

  it('allows disabling a connection whose saved destination was removed', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'removed-destination',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
      },
    });

    render(<LangfuseConnection />);

    expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
      'removed-destination - com_ui_langfuse_destination_unavailable',
    );
    expect(screen.getByText('com_ui_langfuse_destination_removed')).toBeVisible();
    expect(mockTest).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_langfuse_disable' }));

    expect(mockUpdate).toHaveBeenCalledWith(
      {
        enabled: false,
        destination: 'removed-destination',
        publicKey: 'pk-lf-1',
        expectedVersion: null,
        expectedTenantId: '',
      },
      expect.any(Object),
    );
  });

  it('saves immediately without testing when enabling a configured connection', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: false,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
      },
    });
    mockUpdate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        updatedAt: '2026-07-10T15:31:00.000Z',
      });
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
    mockTest.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_langfuse_enable' }));

    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      {
        enabled: true,
        destination: 'eu',
        publicKey: 'pk-lf-1',
        expectedVersion: null,
        expectedTenantId: '',
      },
      expect.any(Object),
    );
    expect(screen.queryByText('com_ui_save')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_langfuse_disable' })).toBeEnabled();
  });

  it('sends the stored version and effective tenant as the write baseline', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: false,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 7,
        effectiveTenantId: 'tenant-b',
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_langfuse_enable' }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 7, expectedTenantId: 'tenant-b' }),
      expect.any(Object),
    );
  });

  it('adopts a lower-version tenant after a conflict and discards the previous tenant draft', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: {
        configured: true,
        enabled: true,
        configActive: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-a',
        secretKeyPreview: 'sk-lf-...aaaa',
        configVersion: 20,
        effectiveTenantId: 'tenant-a',
      },
    });
    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onError?.({
        response: { status: 409, data: { error: 'Tenant context changed' } },
      });
    });
    mockRefetch.mockResolvedValue({
      isError: false,
      data: {
        configured: true,
        enabled: false,
        configActive: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-b',
        secretKeyPreview: 'sk-lf-...bbbb',
        configVersion: 3,
        effectiveTenantId: 'tenant-b',
      },
    });

    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_edit com_ui_langfuse_secret_key' }),
    );
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-tenant-a-draft' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      expectedVersion: 20,
      expectedTenantId: 'tenant-a',
      secretKey: 'sk-lf-tenant-a-draft',
    });
    await waitFor(() => expect(screen.getByText('pk-lf-b')).toBeVisible());
    expect(
      screen.queryByLabelText(/com_ui_langfuse_secret_key/, { selector: 'input' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_langfuse_enable' }));

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0]).toMatchObject({
      expectedVersion: 3,
      expectedTenantId: 'tenant-b',
      publicKey: 'pk-lf-b',
    });
    expect(mockUpdate.mock.calls[1][0]).not.toHaveProperty('secretKey');
  });

  it('shows an inactive base configuration without testing or enabling it', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: {
        configured: true,
        enabled: false,
        configActive: false,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 7,
        effectiveTenantId: 'tenant-a',
      },
    });

    render(<LangfuseConnection />);

    await waitFor(() => expect(screen.getByText('com_ui_langfuse_status_inactive')).toBeVisible());
    expect(screen.getByText('com_ui_langfuse_config_inactive')).toBeVisible();
    expect(screen.getByRole('button', { name: 'com_ui_langfuse_enable' })).toBeDisabled();
    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('disables first-time connection setup while the base configuration is inactive', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: {
        configured: false,
        enabled: false,
        configActive: false,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        configVersion: 7,
        effectiveTenantId: 'tenant-a',
      },
    });

    render(<LangfuseConnection />);

    await waitFor(() => expect(screen.getByText('com_ui_langfuse_status_inactive')).toBeVisible());
    expect(screen.getByTestId('langfuse-destination')).toBeDisabled();
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toBeDisabled();
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_save' })).toBeDisabled();
    expect(mockTest).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rebases onto the refetched record after a conflict, keeping the in-progress secret key draft', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 3,
      },
    });
    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onError?.({ response: { status: 409, data: { currentVersion: 9 } } });
    });
    /** Simulates another admin having moved the destination while this draft was in progress. */
    mockRefetch.mockResolvedValue({
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'us',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 9,
      },
    });

    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_edit com_ui_langfuse_secret_key' }),
    );
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-replacement' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      expectedVersion: 3,
      destination: 'eu',
      secretKey: 'sk-lf-replacement',
    });
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));

    /** The stale destination is replaced by the refetched value; the untyped secret draft survives. */
    await waitFor(() =>
      expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
        'us - https://us.cloud.langfuse.com',
      ),
    );
    expect(screen.getByLabelText(/com_ui_langfuse_secret_key/)).toHaveValue('sk-lf-replacement');

    mockUpdate.mockImplementationOnce((payload, options) => {
      options?.onSuccess?.({
        configured: true,
        enabled: true,
        destinations: [{ key: 'us', baseUrl: 'https://us.cloud.langfuse.com' }],
        destination: 'us',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...cement',
        configVersion: 10,
      });
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0]).toMatchObject({
      expectedVersion: 9,
      destination: 'us',
      secretKey: 'sk-lf-replacement',
    });
  });

  it('does not advance expectedVersion when the post-conflict refetch fails, and surfaces the failure', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: {
        configured: true,
        enabled: true,
        destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 3,
      },
    });
    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onError?.({ response: { status: 409, data: { currentVersion: 9 } } });
    });
    /** A failed refetch (or one that only resolves with stale cached data) must not unblock a retry. */
    mockRefetch.mockResolvedValue({ isError: true, data: undefined });

    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_edit com_ui_langfuse_secret_key' }),
    );
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-replacement' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText('com_ui_langfuse_conflict_refresh_error')).toBeVisible(),
    );

    mockUpdate.mockClear();
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      expectedVersion: 3,
      destination: 'eu',
      secretKey: 'sk-lf-replacement',
    });
  });

  it('preserves a locally edited destination through a rebase, while refreshing the untouched public key', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 3,
      },
    });
    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onError?.({ response: { status: 409, data: { currentVersion: 9 } } });
    });
    /** The other admin's concurrent write changed publicKey, not destination. */
    mockRefetch.mockResolvedValue({
      isError: false,
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'eu',
        publicKey: 'pk-lf-2',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 9,
      },
    });

    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    /** Changing the destination already reveals the secret key input, since credentials changed. */
    await selectDestination('us');
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-replacement' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ destination: 'us', expectedVersion: 3 });
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));

    /**
     * Before this fix, rebasing reset every field from `connectionStatus`
     * unconditionally, so this edit would have been silently reverted to the
     * server's unchanged 'eu' the moment the conflict resolved.
     */
    await waitFor(() =>
      expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
        'us - https://us.cloud.langfuse.com',
      ),
    );

    mockUpdate.mockImplementationOnce((payload, options) => {
      options?.onSuccess?.({ ...payload, configVersion: 10 });
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0]).toMatchObject({
      destination: 'us',
      publicKey: 'pk-lf-2',
      expectedVersion: 9,
      secretKey: 'sk-lf-replacement',
    });
  });

  it('does not let a stale conflict-refetch overwrite a public-key edit made while that refetch is pending', async () => {
    const initialData = {
      configured: true,
      enabled: true,
      destinations: [
        { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
        { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
      ],
      destination: 'eu',
      publicKey: 'pk-lf-1',
      secretKeyPreview: 'sk-lf-...515f',
      configVersion: 3,
    };
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: initialData,
    });
    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onError?.({ response: { status: 409, data: { currentVersion: 9 } } });
    });

    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    /** Changing the destination already reveals the secret key input, since credentials changed. */
    await selectDestination('us');
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-replacement' },
    });

    // Hold the conflict refetch pending so the admin can keep editing while
    // rebaseOnConflict's refetchConnection().then(...) closure is still
    // waiting to fire -- at THIS moment, publicKey is still the untouched
    // 'pk-lf-1', which is what rebaseOnConflict's closure captures.
    let resolveRefetch:
      | ((value: { isError: boolean; data: typeof initialData }) => void)
      | undefined;
    mockRefetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefetch = resolve;
      }),
    );
    await userEvent.click(screen.getByText('com_ui_save'));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));

    /**
     * Inputs stay editable while the conflict refetch is pending -- `busy`
     * only covers mutations, not this refetch. The admin edits publicKey
     * before the refetch settles.
     */
    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_edit com_ui_langfuse_public_key' }),
    );
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-live-edit' },
    });

    // The refetch resolves with the SAME publicKey that was current when
    // rebaseOnConflict was first invoked -- unchanged from anyone else's
    // perspective, but now stale relative to the admin's live edit above.
    await act(async () => {
      resolveRefetch?.({
        isError: false,
        data: { ...initialData, destination: 'us', configVersion: 9 },
      });
    });

    /**
     * Before this fix, applyFreshRecord's touched-ref reconvergence check
     * compared the fresh 'pk-lf-1' against the STALE `publicKey` captured in
     * rebaseOnConflict's closure at the moment the conflict was handled
     * (also 'pk-lf-1' then, since the admin hadn't touched it yet) -- a
     * match that wrongly cleared publicKeyTouchedRef even though the
     * admin's live edit (now 'pk-lf-live-edit') never matched the fresh
     * baseline. The passive sync effect then overwrote the live edit with
     * the stale 'pk-lf-1'.
     */
    await waitFor(() =>
      expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveValue('pk-lf-live-edit'),
    );
  });

  it('rebases the enable/disable toggle after a conflict instead of only advancing the version', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 3,
      },
    });
    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onError?.({ response: { status: 409, data: { currentVersion: 9 } } });
    });
    /** Another admin moved both the destination and the public key while this one clicked Disable. */
    mockRefetch.mockResolvedValue({
      isError: false,
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'us',
        publicKey: 'pk-lf-2',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 9,
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_langfuse_disable' }));

    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      enabled: false,
      destination: 'eu',
      publicKey: 'pk-lf-1',
      expectedVersion: 3,
    });
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
        'us - https://us.cloud.langfuse.com',
      ),
    );

    mockUpdate.mockImplementationOnce((payload, options) => {
      options?.onSuccess?.({ ...payload, configVersion: 10 });
    });
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_langfuse_disable' }));

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0]).toMatchObject({
      enabled: false,
      destination: 'us',
      publicKey: 'pk-lf-2',
      expectedVersion: 9,
    });
  });

  it('does not advance expectedVersion from a passive background refetch while a draft is in progress', async () => {
    const initialData = {
      configured: true,
      enabled: true,
      destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
      destination: 'eu',
      publicKey: 'pk-lf-1',
      secretKeyPreview: 'sk-lf-...515f',
      configVersion: 3,
    };
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: initialData,
    });

    const { rerender } = render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_edit com_ui_langfuse_secret_key' }),
    );
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-in-progress' },
    });

    /**
     * Simulates React Query silently refreshing `data` in the background (e.g.
     * on network reconnect, which it retries by default) while this admin
     * still has an unsaved secret-key draft -- another admin's write already
     * landed server-side, bumping the version with no conflict ever surfacing
     * here since nothing was submitted yet.
     */
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: { ...initialData, configVersion: 4 },
    });
    rerender(<LangfuseConnection />);

    await userEvent.click(screen.getByText('com_ui_save'));

    /**
     * Before this fix, the sync effect always adopted the fresh version
     * regardless of an in-progress draft, so this save would have carried
     * expectedVersion: 4 -- passing CAS on a version never actually paired
     * with this draft's content.
     */
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      expectedVersion: 3,
      secretKey: 'sk-lf-in-progress',
    });
  });

  it('advances expectedVersion on a conflict rebase even when the refetch returns the same object reference as the passive refresh', async () => {
    const initialData = {
      configured: true,
      enabled: true,
      destinations: [{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }],
      destination: 'eu',
      publicKey: 'pk-lf-1',
      secretKeyPreview: 'sk-lf-...515f',
      configVersion: 3,
    };
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: initialData,
    });

    const { rerender } = render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_edit com_ui_langfuse_secret_key' }),
    );
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-in-progress' },
    });

    /** A passive background refresh already installed version 4 -- expectedVersion stays frozen at 3. */
    const passiveData = { ...initialData, configVersion: 4 };
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: passiveData,
    });
    rerender(<LangfuseConnection />);

    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onError?.({ response: { status: 409, data: { currentVersion: 4 } } });
    });
    /**
     * React Query's structural sharing returns the exact same object already
     * held in `connectionStatus` when a refetch's data is unchanged --
     * exercise that here by resolving with the identical `passiveData`
     * reference the passive refresh above already installed.
     */
    mockRefetch.mockResolvedValue({ isError: false, data: passiveData });

    await userEvent.click(screen.getByText('com_ui_save'));
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ expectedVersion: 3 });
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    /**
     * Flushes the refetch's `.then()` microtask: `setConnectionStatus` alone
     * wouldn't be observable here since the object reference is unchanged
     * (that's the whole point of this repro), so there's no DOM side effect
     * to `waitFor` on. `applyFreshRecord` sets `expectedVersion` directly
     * rather than relying on that state update's effect to re-run, so the
     * value is already correct by the time this resolves regardless.
     */
    await act(async () => {
      await Promise.resolve();
    });

    /**
     * Before this fix, `setConnectionStatus(result.data)` with the identical
     * reference was a React state bail-out: the passive-sync effect never
     * re-ran, `expectedVersion` stayed frozen at 3, and this retry would have
     * 409ed again instead of carrying the version the conflict reported.
     */
    mockUpdate.mockImplementationOnce((payload, options) => {
      options?.onSuccess?.({ ...payload, configVersion: 5 });
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0]).toMatchObject({ expectedVersion: 4 });
  });

  it('clears a field’s touched flag once it is edited back to match the current baseline', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 3,
      },
    });
    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onError?.({ response: { status: 409, data: { currentVersion: 9 } } });
    });
    /** The other admin's write happened to move the destination to 'us' too. */
    mockRefetch.mockResolvedValue({
      isError: false,
      data: {
        configured: true,
        enabled: true,
        destinations: [
          { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
          { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
        ],
        destination: 'us',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...515f',
        configVersion: 9,
      },
    });

    render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    /** Selecting 'us' then back to 'eu' leaves the value matching the original baseline again. */
    await selectDestination('us');
    await selectDestination('eu');
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-replacement' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));

    /**
     * Before this fix, the touched ref was set once and never re-evaluated,
     * so it would still read "touched" here even though the value matches the
     * original baseline again -- and the rebase would have kept the stale
     * local 'eu' instead of adopting the refetched 'us'.
     */
    await waitFor(() =>
      expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
        'us - https://us.cloud.langfuse.com',
      ),
    );
  });

  it('recomputes the destination touched flag against the fresh baseline after a rebase reveals the same value', async () => {
    const initialData = {
      configured: true,
      enabled: true,
      destinations: [
        { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
        { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
      ],
      destination: 'eu',
      publicKey: 'pk-lf-1',
      secretKeyPreview: 'sk-lf-...515f',
      configVersion: 3,
    };
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: initialData,
    });
    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onError?.({ response: { status: 409, data: { currentVersion: 9 } } });
    });
    /** Another admin independently changed the destination to that SAME 'us' value. */
    mockRefetch.mockResolvedValue({
      isError: false,
      data: { ...initialData, destination: 'us', configVersion: 9 },
    });

    const { rerender } = render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    /** Admin locally changes destination to 'us' -- marks it touched. */
    await selectDestination('us');
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-replacement' },
    });
    await userEvent.click(screen.getByText('com_ui_save'));
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
        'us - https://us.cloud.langfuse.com',
      ),
    );

    /**
     * Before this fix, the touched ref was preserved unchanged across the
     * rebase (it happened to still read "touched" because it was never
     * re-evaluated against the fresh baseline, not because a real
     * divergence survived) -- so this later passive refresh, which the
     * admin never asked to be frozen against, would have been silently
     * ignored and the destination would have stayed stuck on 'us' forever.
     */
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: { ...initialData, destination: 'eu', configVersion: 10 },
    });
    rerender(<LangfuseConnection />);
    await waitFor(() =>
      expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
        'eu - https://cloud.langfuse.com',
      ),
    );
  });

  it('does not let a background query response that started before a successful save overwrite it afterward', async () => {
    const initialData = {
      configured: true,
      enabled: true,
      destinations: [
        { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
        { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
      ],
      destination: 'eu',
      publicKey: 'pk-lf-old',
      secretKeyPreview: 'sk-lf-...515f',
      configVersion: 3,
    };
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: initialData,
    });

    const { rerender } = render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await selectDestination('us');
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-new' },
    });

    const savedStatus = {
      ...initialData,
      destination: 'us',
      secretKeyPreview: 'sk-lf-...-new',
      configVersion: 4,
    };
    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onSuccess?.(savedStatus);
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
      'us - https://us.cloud.langfuse.com',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'com_ui_edit com_ui_langfuse_secret_key' }),
    );
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-in-progress' },
    });

    /**
     * Simulates a background fetch that started BEFORE the save above (e.g. a
     * reconnect-triggered refetch, which React Query retries by default)
     * finally resolving afterward with the pre-save content --
     * useGetLangfuseConnectionQuery never cancels this on mutation success.
     */
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: { ...initialData },
    });
    rerender(<LangfuseConnection />);

    /**
     * Before this fix, the passive sync effect's `setConnectionStatus(status)`
     * had no version guard and would have unconditionally adopted this stale
     * v3 record, reverting the destination this save just changed to 'us'
     * back to 'eu' -- while expectedVersion stayed correctly frozen at 4
     * because of the in-progress secret-key draft, so the next save would
     * have passed CAS while resubmitting the reverted, stale destination.
     */
    expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
      'us - https://us.cloud.langfuse.com',
    );

    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onSuccess?.({ ...savedStatus, configVersion: 5 });
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate.mock.calls[1][0]).toMatchObject({
      expectedVersion: 4,
      destination: 'us',
      secretKey: 'sk-lf-in-progress',
    });
  });

  it('does not let a null-versioned stale background response overwrite a successful save', async () => {
    const initialData = {
      configured: true,
      enabled: true,
      destinations: [
        { key: 'eu', baseUrl: 'https://cloud.langfuse.com' },
        { key: 'us', baseUrl: 'https://us.cloud.langfuse.com' },
      ],
      destination: 'eu',
      publicKey: 'pk-lf-old',
      secretKeyPreview: 'sk-lf-...515f',
      configVersion: 3,
    };
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: initialData,
    });

    const { rerender } = render(<LangfuseConnection />);
    await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));

    await selectDestination('us');
    fireEvent.change(screen.getByLabelText(/com_ui_langfuse_secret_key/), {
      target: { value: 'sk-lf-new' },
    });

    const savedStatus = {
      ...initialData,
      destination: 'us',
      secretKeyPreview: 'sk-lf-...-new',
      configVersion: 4,
    };
    mockUpdate.mockImplementationOnce((_payload, options) => {
      options?.onSuccess?.(savedStatus);
    });
    await userEvent.click(screen.getByText('com_ui_save'));

    expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
      'us - https://us.cloud.langfuse.com',
    );

    /**
     * Simulates a background fetch that started before the save above
     * resolving afterward with a null configVersion (e.g. a delayed read
     * from before any connection document existed). A numeric
     * `latestVersionRef` must always outrank a null candidate version, or
     * this stale response would revert the destination this save just
     * changed to 'us' back to 'eu'.
     */
    mockGet.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: mockRefetch,
      data: { ...initialData, configVersion: null },
    });
    rerender(<LangfuseConnection />);

    expect(screen.getByTestId('langfuse-destination')).toHaveTextContent(
      'us - https://us.cloud.langfuse.com',
    );
  });
});
