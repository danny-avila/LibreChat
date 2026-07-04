import userEvent from '@testing-library/user-event';
import { render, screen, fireEvent } from '@testing-library/react';
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
  mockGet.mockReturnValue({ data: undefined });
});

describe('LangfuseConnection', () => {
  it('renders the connection form fields', () => {
    render(<LangfuseConnection />);
    expect(screen.getByLabelText('com_ui_langfuse_base_url')).toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_langfuse_secret_key')).toBeInTheDocument();
  });

  it('prefills stored values and shows the key fingerprint without the secret', () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        baseUrl: 'https://cloud.langfuse.com',
        publicKey: 'pk-lf-1',
        secretKeyFingerprint: 'abc123def456',
      },
    });
    render(<LangfuseConnection />);

    expect(screen.getByLabelText('com_ui_langfuse_base_url')).toHaveValue(
      'https://cloud.langfuse.com',
    );
    expect(screen.getByLabelText('com_ui_langfuse_public_key')).toHaveValue('pk-lf-1');
    expect(screen.getByLabelText('com_ui_langfuse_secret_key')).toHaveValue('');
    expect(screen.getByText('abc123def456')).toBeInTheDocument();
  });

  it('includes the typed secret key when saving a new connection', async () => {
    render(<LangfuseConnection />);
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_base_url'), {
      target: { value: 'https://cloud.langfuse.com' },
    });
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_public_key'), {
      target: { value: 'pk-lf-1' },
    });
    fireEvent.change(screen.getByLabelText('com_ui_langfuse_secret_key'), {
      target: { value: 'sk-lf-secret' },
    });

    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual({
      enabled: false,
      baseUrl: 'https://cloud.langfuse.com',
      publicKey: 'pk-lf-1',
      secretKey: 'sk-lf-secret',
    });
  });

  it('omits the secret key when saving without re-entering it for an already-configured connection', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        baseUrl: 'https://cloud.langfuse.com',
        publicKey: 'pk-lf-1',
        secretKeyFingerprint: 'abc123def456',
      },
    });
    render(<LangfuseConnection />);

    await userEvent.click(screen.getByText('com_ui_save'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('secretKey');
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ publicKey: 'pk-lf-1' });
  });

  it('triggers a connection test', async () => {
    mockGet.mockReturnValue({
      data: {
        configured: true,
        enabled: true,
        baseUrl: 'https://cloud.langfuse.com',
        publicKey: 'pk-lf-1',
      },
    });
    render(<LangfuseConnection />);

    await userEvent.click(screen.getByText('com_ui_langfuse_test'));

    expect(mockTest).toHaveBeenCalledTimes(1);
    expect(mockTest.mock.calls[0][0]).toMatchObject({
      baseUrl: 'https://cloud.langfuse.com',
      publicKey: 'pk-lf-1',
    });
  });
});
