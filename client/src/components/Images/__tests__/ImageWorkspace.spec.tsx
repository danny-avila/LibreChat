import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from 'test/layout-test-utils';
import { QueryKeys } from 'librechat-data-provider';

// --- mock data (prefixed with mock so jest.mock factories can reference them) ---
const mockGenerateMutate = jest.fn();
const mockInvalidateQueries = jest.fn();

// When true, the mocked generate mutation invokes onError instead of onSuccess
const mockGenerateBehavior = { shouldError: false };

// This holder is accessed inside jest.mock factory via closure-safe `mock` prefix
const mockImageResultHolder = {
  data: undefined as
    | { status: 'created' | 'processing' | 'completed' | 'failed'; file?: object }
    | undefined,
};

const mockModelsConfig = {
  models: [
    {
      id: 'flux-pro',
      label: 'Flux Pro',
      supportsEdit: false,
      paramKey: 'quality',
      paramValues: ['standard', 'hd'],
      defaultParam: 'standard',
    },
    {
      id: 'flux-edit',
      label: 'Flux Edit',
      supportsEdit: true,
      paramKey: 'quality',
      paramValues: ['standard'],
      defaultParam: 'standard',
    },
  ],
  default: 'flux-pro',
  aspectRatios: ['1:1', '16:9', '9:16'],
};

jest.mock('~/data-provider', () => ({
  useImageModels: () => ({ data: mockModelsConfig }),
  useGenerateImage: ({
    onSuccess,
    onError,
  }: {
    onSuccess?: (d: { predictionId: string }) => void;
    onError?: (e: unknown) => void;
  }) => ({
    mutate: (args: unknown) => {
      mockGenerateMutate(args);
      if (mockGenerateBehavior.shouldError) {
        onError?.(new Error('boom'));
      } else {
        onSuccess?.({ predictionId: 'pred-123' });
      }
    },
  }),
  useImageResult: (_predictionId: string | null, enabled: boolean) => ({
    data: enabled ? mockImageResultHolder.data : undefined,
  }),
  useImageGallery: () => ({
    data: { pages: [] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  // Required by AuthContextProvider in layout-test-utils wrapper
  useGetRole: () => ({ data: null }),
  useGetUserQuery: () => ({ data: null }),
  useLoginUserMutation: () => ({ mutate: jest.fn() }),
  useLogoutUserMutation: () => ({ mutate: jest.fn() }),
  useRefreshTokenMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ isAuthenticated: true, user: { id: 'u1' }, roles: {} }),
}));

jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    Spinner: () => <span data-testid="spinner" />,
    Button: ({
      children,
      onClick,
      disabled,
      'aria-label': ariaLabel,
      ...rest
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label'?: string }) => (
      <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...rest}>
        {children}
      </button>
    ),
    TextareaAutosize: ({
      value,
      onChange,
      placeholder,
      'aria-label': ariaLabel,
      minRows: _minRows,
      maxRows: _maxRows,
      ...rest
    }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
      'aria-label'?: string;
      minRows?: number;
      maxRows?: number;
    }) => (
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        {...rest}
      />
    ),
    Select: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value?: string;
      onValueChange?: (v: string) => void;
    }) => (
      <div data-testid="select" data-value={value}>
        {children}
      </div>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <div data-value={value}>{children}</div>
    ),
  };
});

import ImageWorkspace from '../ImageWorkspace';

describe('ImageWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockImageResultHolder.data = undefined;
    mockGenerateBehavior.shouldError = false;
  });

  it('renders prompt textarea and Generate button', () => {
    render(<ImageWorkspace />);
    expect(
      screen.getByRole('textbox', { name: 'com_ui_image_prompt_placeholder' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_generate' })).toBeInTheDocument();
  });

  it('Generate button is disabled when prompt is empty', () => {
    render(<ImageWorkspace />);
    const btn = screen.getByRole('button', { name: 'com_ui_generate' });
    expect(btn).toBeDisabled();
  });

  it('Generate button is enabled after entering a prompt', () => {
    render(<ImageWorkspace />);
    const textarea = screen.getByRole('textbox', { name: 'com_ui_image_prompt_placeholder' });
    fireEvent.change(textarea, { target: { value: 'a sunset over the mountains' } });
    const btn = screen.getByRole('button', { name: 'com_ui_generate' });
    expect(btn).not.toBeDisabled();
  });

  it('clicking Generate calls mutate with prompt and default model', () => {
    render(<ImageWorkspace />);
    const textarea = screen.getByRole('textbox', { name: 'com_ui_image_prompt_placeholder' });
    fireEvent.change(textarea, { target: { value: 'a sunset over the mountains' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_generate' }));
    expect(mockGenerateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'a sunset over the mountains',
        model: 'flux-pro',
      }),
    );
  });

  it('shows generating state (spinner) while prediction pending', async () => {
    // data stays undefined so polling keeps going
    mockImageResultHolder.data = undefined;
    render(<ImageWorkspace />);
    const textarea = screen.getByRole('textbox', { name: 'com_ui_image_prompt_placeholder' });
    fireEvent.change(textarea, { target: { value: 'a sunset' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_generate' }));

    await waitFor(() => {
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });
  });

  it('clears generating state and invalidates gallery on completed result', async () => {
    mockImageResultHolder.data = { status: 'completed' };

    render(<ImageWorkspace />);
    const textarea = screen.getByRole('textbox', { name: 'com_ui_image_prompt_placeholder' });
    fireEvent.change(textarea, { target: { value: 'a sunset' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_generate' }));

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith([QueryKeys.imageGallery]);
    });

    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });

  it('shows error message on failed result', async () => {
    mockImageResultHolder.data = { status: 'failed' };

    render(<ImageWorkspace />);
    const textarea = screen.getByRole('textbox', { name: 'com_ui_image_prompt_placeholder' });
    fireEvent.change(textarea, { target: { value: 'a sunset' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_generate' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('com_ui_image_failed');
    });
  });

  it('unlocks the Generate button and shows error when the mutation itself errors', async () => {
    mockGenerateBehavior.shouldError = true;

    render(<ImageWorkspace />);
    const textarea = screen.getByRole('textbox', { name: 'com_ui_image_prompt_placeholder' });
    fireEvent.change(textarea, { target: { value: 'a sunset' } });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_generate' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('com_ui_image_failed');
    });

    // predictionId never set → polling never starts; button must not stay locked
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_generate' })).not.toBeDisabled();
  });
});
