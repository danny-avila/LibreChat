import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FileSources } from 'librechat-data-provider';
import FilePreviewDialog from '../FilePreviewDialog';

const mockDownloadFile = jest.fn();
const mockFetchTextPreview = jest.fn();
const mockTriggerDownload = jest.fn();
const mockCreateObjectURL = jest.fn();

jest.mock('recoil', () => ({
  useRecoilValue: () => ({ id: 'user-1' }),
}));

jest.mock('@librechat/client', () => ({
  OGDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  OGDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

jest.mock('~/components/Messages/Content/CopyButton', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

jest.mock('~/data-provider', () => ({
  useFileDownload: () => ({ refetch: mockDownloadFile }),
  useFilePreview: () => ({ refetch: mockFetchTextPreview }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { user: {} },
}));

jest.mock('~/utils', () => ({
  logger: { error: jest.fn() },
  sortPagesByRelevance: (pages: number[]) => pages,
  triggerDownload: (...args: Parameters<typeof mockTriggerDownload>) =>
    mockTriggerDownload(...args),
}));

describe('FilePreviewDialog text-source previews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue('blob:text-source');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: mockCreateObjectURL,
    });
  });

  it('loads text-backed files from the preview endpoint instead of the download route', async () => {
    mockFetchTextPreview.mockResolvedValueOnce({
      data: { file_id: 'file-text', status: 'ready', text: 'hello from db' },
    });

    render(
      <FilePreviewDialog
        open
        onOpenChange={jest.fn()}
        fileName="example.txt"
        fileId="file-text"
        fileType="text/plain"
        source={FileSources.text}
      />,
    );

    expect(await screen.findByText('hello from db')).toBeInTheDocument();
    expect(mockFetchTextPreview).toHaveBeenCalledTimes(1);
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it('creates a local text blob for text-source downloads', async () => {
    mockFetchTextPreview.mockResolvedValueOnce({
      data: { file_id: 'file-text', status: 'ready', text: 'download me' },
    });

    render(
      <FilePreviewDialog
        open
        onOpenChange={jest.fn()}
        fileName="example.txt"
        fileId="file-text"
        fileType="text/plain"
        source={FileSources.text}
      />,
    );

    await screen.findByText('download me');
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_download example.txt' }));

    await waitFor(() => {
      expect(mockTriggerDownload).toHaveBeenCalledWith('blob:text-source', 'example.txt');
    });
    expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });
});
