import { act, renderHook, waitFor } from '@testing-library/react';
import { useMCPServerForm } from '../useMCPServerForm';

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider/MCP', () => ({
  useCreateMCPServerMutation: () => ({ mutateAsync: jest.fn() }),
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
