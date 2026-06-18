import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileSources } from 'librechat-data-provider';
import LogLink from '../LogLink';

const mockShowToast = jest.fn();
const mockDownloadFromApi = jest.fn();
const mockDownloadFromUrl = jest.fn();
const mockTriggerDownload = jest.fn();

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/data-provider', () => ({
  useFileDownload: () => ({ refetch: mockDownloadFromApi }),
  useCodeOutputDownload: () => ({ refetch: mockDownloadFromUrl }),
}));

jest.mock('~/utils', () => ({
  isHttpDownloadTarget: (target?: string | null) => /^https?:\/\//i.test(target ?? ''),
  triggerDownload: (...args: Parameters<typeof mockTriggerDownload>) =>
    mockTriggerDownload(...args),
}));

describe('LogLink download routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates directly to http URLs when no stored file metadata is available', async () => {
    const filename = 'report.pptx';
    render(
      <LogLink href="https://cdn.example.com/uploads/report.pptx" filename={filename}>
        {filename}
      </LogLink>,
    );

    fireEvent.click(screen.getByRole('link', { name: filename }));

    await waitFor(() => {
      expect(mockTriggerDownload).toHaveBeenCalledWith(
        'https://cdn.example.com/uploads/report.pptx',
        'report.pptx',
      );
    });
    expect(mockDownloadFromUrl).not.toHaveBeenCalled();
    expect(mockDownloadFromApi).not.toHaveBeenCalled();
  });

  it('uses the authorized file download route when stored metadata is available', async () => {
    const filename = 'file.pdf';
    mockDownloadFromApi.mockResolvedValue({ data: 'https://cdn.example.com/signed/file.pdf' });

    render(
      <LogLink
        user="user-1"
        file_id="file-1"
        filename={filename}
        source={FileSources.cloudfront}
        href="https://cdn.example.com/uploads/file.pdf"
      >
        {filename}
      </LogLink>,
    );

    fireEvent.click(screen.getByRole('link', { name: filename }));

    await waitFor(() => {
      expect(mockTriggerDownload).toHaveBeenCalledWith(
        'https://cdn.example.com/signed/file.pdf',
        'file.pdf',
      );
    });
    expect(mockDownloadFromApi).toHaveBeenCalledTimes(1);
    expect(mockDownloadFromUrl).not.toHaveBeenCalled();
  });

  it('keeps legacy code-output handles on the blob download path', async () => {
    const filename = 'legacy.txt';
    mockDownloadFromUrl.mockResolvedValue({ data: 'blob:https://app.example.com/file' });

    render(
      <LogLink
        href="/api/files/code/download/session-1/file-1"
        filename={filename}
        source={FileSources.execute_code}
      >
        {filename}
      </LogLink>,
    );

    fireEvent.click(screen.getByRole('link', { name: filename }));

    await waitFor(() => {
      expect(mockTriggerDownload).toHaveBeenCalledWith(
        'blob:https://app.example.com/file',
        'legacy.txt',
      );
    });
    expect(mockDownloadFromUrl).toHaveBeenCalledTimes(1);
    expect(mockDownloadFromApi).not.toHaveBeenCalled();
  });
});
