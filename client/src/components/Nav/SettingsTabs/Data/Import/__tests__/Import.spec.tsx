import userEvent from '@testing-library/user-event';
import type { TImportResponse, TImportSummary } from 'librechat-data-provider';
import { render, screen, act } from 'test/layout-test-utils';
import Import from '../index';

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useUploadImportMutation: jest.fn(),
  useStartImportMutation: jest.fn(),
  useCancelImportMutation: jest.fn(),
  useImportJobQuery: jest.fn(),
}));

const dataProvider = jest.requireMock('~/data-provider');

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

describe('Import panel', () => {
  let capturedUploadOptions: {
    onSuccess?: (data: TImportResponse) => void;
    onError?: (error: unknown) => void;
  } = {};

  beforeEach(() => {
    capturedUploadOptions = {};
    dataProvider.useUploadImportMutation.mockImplementation(
      (options: typeof capturedUploadOptions) => {
        capturedUploadOptions = options ?? {};
        return { mutate: jest.fn(), isLoading: false };
      },
    );
    dataProvider.useStartImportMutation.mockReturnValue({ mutate: jest.fn(), isLoading: false });
    dataProvider.useCancelImportMutation.mockReturnValue({ mutate: jest.fn(), isLoading: false });
    dataProvider.useImportJobQuery.mockReturnValue({ data: undefined });
  });

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

  it('shows the detected summary before importing', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: {
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
      },
    });

    render(<Import />);
    expect(screen.getByText(/2929 conversations/i)).toBeInTheDocument();
    expect(screen.getByText(/412 archived/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^import$/i })).toBeInTheDocument();
  });

  it('exposes progress with aria attributes while running', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: {
        jobId: 'j1',
        filename: 'export.zip',
        phase: 'conversations',
        status: 'active',
        summary: summary(),
        progress: {
          conversations: { done: 1840, total: 2929 },
          messages: { done: 14000, total: 0 },
          assets: { done: 0, total: 1666 },
        },
        report: null,
        error: null,
        createdAt: 0,
        updatedAt: 0,
      },
    });

    render(<Import />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1840');
    expect(bar).toHaveAttribute('aria-valuemax', '2929');
    expect(bar).toHaveAttribute('aria-label');
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders an indeterminate progressbar while queued, with no total yet', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: {
        jobId: 'j1',
        filename: 'export.zip',
        phase: 'queued',
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
      },
    });

    render(<Import />);
    const bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
  });

  it('shows the final report', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: {
        jobId: 'j1',
        filename: 'export.zip',
        phase: 'completed',
        status: 'completed',
        summary: summary(),
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
        error: null,
        createdAt: 0,
        updatedAt: 0,
      },
    });

    render(<Import />);
    expect(screen.getByText(/2929 conversations imported/i)).toBeInTheDocument();
    expect(screen.getByText(/793 unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import another/i })).toBeInTheDocument();
  });

  it('expands the error list on the final report when there are errors', () => {
    dataProvider.useImportJobQuery.mockReturnValue({
      data: {
        jobId: 'j1',
        filename: 'export.zip',
        phase: 'failed',
        status: 'failed',
        summary: summary(),
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
        createdAt: 0,
        updatedAt: 0,
      },
    });

    render(<Import />);
    expect(screen.getByText(/1 items could not be imported/i)).toBeInTheDocument();
    expect(screen.getByText(/conversation 11 malformed/i)).toBeInTheDocument();
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
  });

  it('starts polling the created job when a ChatGPT export starts a background job', () => {
    render(<Import />);

    act(() => {
      capturedUploadOptions.onSuccess?.({ jobId: 'job-42', summary: summary() });
    });

    expect(dataProvider.useImportJobQuery).toHaveBeenCalledWith('job-42');
  });
});
