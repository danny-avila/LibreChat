import React from 'react';
import { FileSources } from 'librechat-data-provider';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TAttachment } from 'librechat-data-provider';
import Attachment from '../Attachment';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      key,
  useAttachmentPreviewSync: () => ({ status: 'ready', previewError: undefined, isPolling: false }),
  useExpandCollapse: () => ({ style: {}, ref: { current: null } }),
}));

const mockHandleDownload = jest.fn();
jest.mock('../LogLink', () => ({
  useAttachmentLink: () => ({ handleDownload: mockHandleDownload }),
}));

jest.mock('~/components/Chat/Input/Files/FileContainer', () => ({
  __esModule: true,
  default: ({ file, onClick }: { file: { filename?: string }; onClick?: () => void }) => (
    <button type="button" data-testid="file-container" onClick={onClick}>
      {file.filename ?? ''}
    </button>
  ),
}));

jest.mock('../../FilePreviewDialog', () => ({
  __esModule: true,
  default: ({ open, fileName }: { open: boolean; fileName: string }) =>
    open ? <div data-testid="preview-dialog">{fileName}</div> : null,
}));

// `type` is nominally `Tools` on `TAttachment`, but the render path reads it
// as a MIME string (see `detectArtifactTypeFromFile`/`getPreviewKind`), so
// fixtures assert the mime value through `as unknown` like the sibling
// `attachmentTypes.test.ts` fixtures do.
const executeCodeAttachment = (overrides: Record<string, unknown> = {}): TAttachment =>
  ({
    file_id: 'file-1',
    filename: 'report.pdf',
    filepath: '/api/files/code/download/session-1/file-1',
    type: 'application/pdf',
    source: FileSources.execute_code,
    ...overrides,
  }) as unknown as TAttachment;

describe('FileAttachment preview routing', () => {
  beforeEach(() => {
    mockHandleDownload.mockReset();
  });

  it('opens the preview dialog for a previewable execute_code PDF instead of downloading', () => {
    render(<Attachment attachment={executeCodeAttachment()} />);
    fireEvent.click(screen.getByTestId('file-container'));
    expect(screen.getByTestId('preview-dialog')).toHaveTextContent('report.pdf');
    expect(mockHandleDownload).not.toHaveBeenCalled();
  });

  it('falls back to downloading a non-previewable execute_code file', () => {
    render(
      <Attachment
        attachment={executeCodeAttachment({
          filename: 'archive.zip',
          type: 'application/zip',
        })}
      />,
    );
    fireEvent.click(screen.getByTestId('file-container'));
    expect(mockHandleDownload).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('preview-dialog')).not.toBeInTheDocument();
  });
});
