import { act, renderHook, waitFor } from '@testing-library/react';
import { AuthTypeEnum, useMCPServerForm } from '../useMCPServerForm';

const mockCreateServer = jest.fn();

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider/MCP', () => ({
  useCreateMCPServerMutation: () => ({ mutateAsync: mockCreateServer }),
  useUpdateMCPServerMutation: () => ({ mutateAsync: jest.fn() }),
  useDeleteMCPServerMutation: () => ({ mutateAsync: jest.fn() }),
}));

describe('useMCPServerForm', () => {
  it('preserves a title derived from an initial URL when the form resets', async () => {
    const { result } = renderHook(() =>
      useMCPServerForm({ initialValues: { url: 'https://api.example.com/mcp' } }),
    );

    await waitFor(() => {
      expect(result.current.methods.getValues('title')).toBe('Example API');
    });

    act(() => {
      result.current.resetForm();
    });

    expect(result.current.methods.getValues('title')).toBe('Example API');
  });
});

it('prefills the form without trusting, authenticating, or creating the server', () => {
  const { result } = renderHook(() =>
    useMCPServerForm({
      initialValues: { title: 'Explicit title', url: 'https://example.com/mcp', type: 'sse' },
    }),
  );
  expect(result.current.methods.getValues()).toMatchObject({
    title: 'Explicit title',
    url: 'https://example.com/mcp',
    type: 'sse',
    trust: false,
    auth: { auth_type: AuthTypeEnum.None, api_key: '', oauth_client_secret: '' },
  });
  expect(mockCreateServer).not.toHaveBeenCalled();
});
