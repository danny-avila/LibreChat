import userEvent from '@testing-library/user-event';
import * as librechatClient from '@librechat/client';
import type { TImportResponse, TImportSummary } from 'librechat-data-provider';
import { render, screen, act, fireEvent } from 'test/layout-test-utils';
import Import from '../index';

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useGetStartupConfig: jest.fn(),
  useUploadImportMutation: jest.fn(),
  useStartImportMutation: jest.fn(),
  useCancelImportMutation: jest.fn(),
  useImportJobQuery: jest.fn(),
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: jest.fn(),
}));

const dataProvider = jest.requireMock('~/data-provider');
const mockUseToastContext = librechatClient.useToastContext as jest.Mock;

function summary(): TImportSummary {
  return {
    source: 'chatgpt',
    manifestVersion: 1,
    conversations: 2929,
    shards: 30,
    assets: 1666,
    assetBytes: 771588944,
    archived: 412,
    starred: 38,
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    jobId: 'j1',
    filename: 'export.zip',
    phase: 'awaiting_confirmation',
    status: 'active',
    summary: summary(),
    progress: {
      conversations: { done: 0, total: 0 },
      messages: { done: 0, total: 0 },
      assets: { done: 0, total: 0 },
    },
    report: null,
    error: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('Import panel', () => {
  let capturedUploadOptions: {
    onSuccess?: (data: TImportResponse) => void;
    onError?: (error: unknown) => void;
  } = {};
  let capturedStartOptions: { onError?: (error: unknown) => void } = {};
  let showToast: jest.Mock;
  let uploadMutate: jest.Mock;

  beforeEach(() => {
    capturedUploadOptions = {};
    capturedStartOptions = {};
    showToast = jest.fn();
    uploadMutate = jest.fn();

    mockUseToastContext.mockReturnValue({ showToast });
    dataProvider.useGetStartupConfig.mockReturnValue({ data: undefined });
    dataProvider.useUploadImportMutation.mockImplementation(
      (options: typeof capturedUploadOptions) => {
        capturedUploadOptions = options ?? {};
        return { mutate: uploadMutate, isLoading: false };
      },
    );
    dataProvider.useStartImportMutation.mockImplementation(
      (options: typeof capturedStartOptions) => {
        capturedStartOptions = options ?? {};
        return { mutate: jest.fn(), isLoading: false };
      },
    );
    dataProvider.useCancelImportMutation.mockReturnValue({ mutate: jest.fn(), isLoading: false });
    dataProvider.useImportJobQuery.mockReturnValue({ data: undefined });
    window.localStorage.clear();
  });

  function getFileInput(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) {
      throw new Error('file input not found');
    }
    return input;
  }

  it('renders a keyboard-operable drop zone', async () => {
    const clickSpy = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<Import />);
    const zone = screen.getByRole('button', { name: /drop a \.zip or \.json/i });
    expect(zone).toBeInTheDocument();
    expect(zone.tagName).toBe('BUTTON');

    const user = userEvent.setup();
    await user.tab();
    expect(zone).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it('does not give the drop zone a label that mismatches its visible text while uploading', () => {
    const { rerender } = render(<Import />);
    const idleZone = screen.getByRole('button', { name: /drop a \.zip or \.json/i });
    expect(idleZone).toHaveAccessibleName('Drop a .zip or .json file here, or click to choose');

    dataProvider.useUploadImportMutation.mockImplementation(
      (options: typeof capturedUploadOptions) => {
        capturedUploadOptions = options ?? {};
        return { mutate: uploadMutate, isLoading: true };
      },
    );
    rerender(<Import />);
    const busyZone = screen.getByRole('button', { name: /importing/i });
    expect(busyZone).toHaveAccessibleName('Importing');
  });

  it('shows a specific toast when the file is over the configured size limit, and never uploads it', () => {
    dataProvider.useGetStartupConfig.mockReturnValue({
      data: { conversationImportMaxFileSize: 10 },
    });

    render(<Import />);
    const file = new File(['x'], 'export.zip');
    Object.defineProperty(file, 'size', { value: 1000 });
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    expect(uploadMutate).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('accepts a large file when the configured limit is 0, which means no limit', () => {
    dataProvider.useGetStartupConfig.mockReturnValue({
      data: { conversationImportMaxFileSize: 0 },
    });

    render(<Import />);
    const file = new File(['x'], 'export.zip');
    Object.defineProperty(file, 'size', { value: 800 * 1024 * 1024 });
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    expect(uploadMutate).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows the detected summary before importing, with real numbers and no raw placeholders', () => {
    dataProvider.useImportJobQuery.mockReturnValue({ data: job() });

    render(<Import />);
    expect(screen.getByText(/2929 conversations/i)).toBeInTheDocument();
    expect(screen.getByText(/412 archived/i)).toBeInTheDocument();
    expect(screen.getByText(/38 starred/i)).toBeInTheDocument();
    expect(screen.getByText(/1666 attachments \(735\.\d+ MB\)/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\{\{/);

    const confirmButton = screen.getByRole('button', { name: /^import$/i });
    const cancelButton = screen.getByRole('button', { name: /cancel import/i });
    expect(confirmButton).toHaveAccessibleName();
    expect(cancelButton).toHaveAccessibleName();
  });

  it('moves focus to the summary heading when the panel enters awaiting_confirmation', () => {
    dataProvider.useImportJobQuery.mockReturnValue({ data: job() });

    render(<Import />);
    expect(screen.getByRole('heading', { name: /detected chatgpt export/i })).toHaveFocus();
  });

  it('keeps the confirm and cancel buttons accessible while busy', () => {
    dataProvider.useImportJobQuery.mockReturnValue({ data: job() });
    dataProvider.useStartImportMutation.mockReturnValue({ mutate: jest.fn(), isLoading: true });
    dataProvider.useCancelImportMutation.mockReturnValue({ mutate: jest.fn(), isLoading: true });

    render(<Import />);
    const confirmButton = screen.getByRole('button', { name: /^import$/i });
    const cancelButton = screen.getByRole('button', { name: /cancel import/i });
    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
    expect(confirmButton).toHaveAccessibleName('Import');
    expect(cancelButton).toHaveAccessibleName('Cancel import');
  });

  it('exposes progress with aria attributes while running', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'conversations',
        status: 'active',
        progress: {
          conversations: { done: 1840, total: 2929 },
          messages: { done: 14000, total: 0 },
          assets: { done: 0, total: 1666 },
        },
      }),
    });

    render(<Import />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1840');
    expect(bar).toHaveAttribute('aria-valuemax', '2929');
    expect(bar).toHaveAttribute('aria-label');
    const cancelButton = screen.getByRole('button', { name: /cancel import/i });
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton).toHaveAccessibleName('Cancel import');
  });

  it('keeps the cancel button accessible while cancelling', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'conversations',
        status: 'active',
        progress: {
          conversations: { done: 1840, total: 2929 },
          messages: { done: 14000, total: 0 },
          assets: { done: 0, total: 1666 },
        },
      }),
    });
    dataProvider.useCancelImportMutation.mockReturnValue({ mutate: jest.fn(), isLoading: true });

    render(<Import />);
    const cancelButton = screen.getByRole('button', { name: /cancel import/i });
    expect(cancelButton).toBeDisabled();
    expect(cancelButton).toHaveAccessibleName('Cancel import');
  });

  it('moves focus to the progress status on mount and again when the phase changes', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'conversations',
        status: 'active',
        progress: {
          conversations: { done: 1840, total: 2929 },
          messages: { done: 14000, total: 0 },
          assets: { done: 0, total: 1666 },
        },
      }),
    });

    const { rerender } = render(<Import />);
    expect(screen.getByRole('status')).toHaveFocus();

    (screen.getByRole('status') as HTMLElement).blur();
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'assets',
        status: 'active',
        progress: {
          conversations: { done: 2929, total: 2929 },
          messages: { done: 23515, total: 0 },
          assets: { done: 400, total: 1666 },
        },
      }),
    });
    rerender(<Import />);

    expect(screen.getByRole('status')).toHaveFocus();
  });

  it('renders an indeterminate progressbar while queued, with no total yet', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'queued',
        status: 'active',
      }),
    });

    render(<Import />);
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
  });

  it('shows the final report and announces the outcome counts', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'completed',
        status: 'completed',
        progress: {
          conversations: { done: 2929, total: 2929 },
          messages: { done: 23515, total: 0 },
          assets: { done: 1666, total: 1666 },
        },
        report: {
          imported: 2929,
          skipped: 0,
          assetsImported: 1666,
          assetsUnavailable: 793,
          errors: [],
        },
      }),
    });

    render(<Import />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/2929 conversations imported/i);
    expect(status).toHaveTextContent(/793 unavailable/i);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import another/i })).toBeInTheDocument();
  });

  it('shows the cancelled outcome', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'cancelled',
        status: 'cancelled',
        report: {
          imported: 500,
          skipped: 0,
          assetsImported: 100,
          assetsUnavailable: 0,
          errors: [],
        },
      }),
    });

    render(<Import />);
    expect(screen.getByText(/import cancelled/i)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import another/i })).toBeInTheDocument();
  });

  it('expands the error list on the final report when there are errors', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'failed',
        status: 'failed',
        progress: {
          conversations: { done: 10, total: 2929 },
          messages: { done: 0, total: 0 },
          assets: { done: 0, total: 1666 },
        },
        report: {
          imported: 10,
          skipped: 0,
          assetsImported: 0,
          assetsUnavailable: 0,
          errors: ['conversation 11 malformed'],
        },
        error: 'archive truncated',
      }),
    });

    render(<Import />);
    expect(screen.getAllByText(/1 items could not be imported/i)).toHaveLength(2);
    expect(screen.getByText(/conversation 11 malformed/i)).toBeInTheDocument();
    expect(screen.getByText(/archive truncated/i)).toBeInTheDocument();
  });

  it('moves focus back to the drop zone after starting another import', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'completed',
        status: 'completed',
        report: {
          imported: 2929,
          skipped: 0,
          assetsImported: 1666,
          assetsUnavailable: 793,
          errors: [],
        },
      }),
    });

    const { rerender } = render(<Import />);
    fireEvent.click(screen.getByRole('button', { name: /import another/i }));

    dataProvider.useImportJobQuery.mockReturnValue({ data: undefined });
    rerender(<Import />);

    expect(screen.getByRole('button', { name: /drop a \.zip or \.json/i })).toHaveFocus();
  });

  it('moves focus to a loading status while the created job has not been fetched yet', () => {
    render(<Import />);

    act(() => {
      capturedUploadOptions.onSuccess?.({ jobId: 'job-42', summary: summary() });
    });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/importing/i);
    expect(status).toHaveFocus();
  });

  it('shows a success toast and never starts a job when the upload finishes synchronously', () => {
    render(<Import />);
    expect(screen.getByRole('button', { name: /drop a \.zip or \.json/i })).toBeInTheDocument();

    act(() => {
      capturedUploadOptions.onSuccess?.({ message: 'Imported 3 conversations' });
    });

    expect(screen.getByRole('button', { name: /drop a \.zip or \.json/i })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(dataProvider.useImportJobQuery).not.toHaveBeenCalledWith(expect.stringMatching(/.+/));
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Imported 3 conversations', severity: 'success' }),
    );
  });

  it('starts polling the created job when a ChatGPT export starts a background job', () => {
    render(<Import />);

    act(() => {
      capturedUploadOptions.onSuccess?.({ jobId: 'job-42', summary: summary() });
    });

    expect(dataProvider.useImportJobQuery).toHaveBeenCalledWith('job-42');
  });

  it('shows a recoverable error instead of an endless spinner when the job cannot be fetched', () => {
    dataProvider.useImportJobQuery.mockReturnValue({ data: undefined, isError: true });
    render(<Import />);

    act(() => {
      capturedUploadOptions.onSuccess?.({ jobId: 'job-42', summary: summary() });
    });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/could not be found/i);
    expect(screen.getByRole('button', { name: /import another/i })).toBeInTheDocument();
  });

  it('rejoins a running job recorded before the panel unmounted', () => {
    window.localStorage.setItem('importJobId', 'job-99');
    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({ phase: 'conversations', status: 'active' }),
    });

    render(<Import />);

    expect(dataProvider.useImportJobQuery).toHaveBeenCalledWith('job-99');
    expect(
      screen.queryByRole('button', { name: /drop a \.zip or \.json/i }),
    ).not.toBeInTheDocument();
  });

  it('records the started job so it survives the panel unmounting, and clears it on reset', () => {
    const { rerender } = render(<Import />);

    act(() => {
      capturedUploadOptions.onSuccess?.({ jobId: 'job-42', summary: summary() });
    });
    expect(window.localStorage.getItem('importJobId')).toBe('job-42');

    dataProvider.useImportJobQuery.mockReturnValue({
      data: job({
        phase: 'completed',
        status: 'completed',
        report: {
          imported: 1,
          skipped: 0,
          assetsImported: 0,
          assetsUnavailable: 0,
          errors: [],
        },
      }),
    });
    rerender(<Import />);
    fireEvent.click(screen.getByRole('button', { name: /import another/i }));

    expect(window.localStorage.getItem('importJobId')).toBeNull();
  });

  it('shows a distinct toast for an unsupported file type', () => {
    render(<Import />);

    act(() => {
      capturedUploadOptions.onError?.({
        response: { data: { message: 'Unsupported import type' } },
      });
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Unsupported import type', severity: 'error' }),
    );
  });

  it('shows a generic toast for any other upload failure', () => {
    render(<Import />);

    act(() => {
      capturedUploadOptions.onError?.(new Error('network down'));
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Error uploading file. Please try again.',
        severity: 'error',
      }),
    );
  });

  it('shows an error toast when confirming the import fails', () => {
    dataProvider.useImportJobQuery.mockReturnValue({ data: job() });
    render(<Import />);

    act(() => {
      capturedStartOptions.onError?.(new Error('start failed'));
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'There was an error importing your data',
        severity: 'error',
      }),
    );
  });
});
