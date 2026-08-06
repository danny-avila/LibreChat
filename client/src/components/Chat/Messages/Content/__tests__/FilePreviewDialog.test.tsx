import React from 'react';
import { FileSources } from 'librechat-data-provider';
import { render, screen, waitFor } from '@testing-library/react';
import FilePreviewDialog from '../FilePreviewDialog';

const mockDownload = jest.fn().mockResolvedValue({ data: null });

jest.mock('~/data-provider', () => ({
  useFileDownload: () => ({ refetch: mockDownload }),
  useSharedFileDownload: () => ({ refetch: mockDownload }),
  useFilePreview: () => ({
    data: { file_id: 'f1', status: 'ready', text: '## Slide one\n\n| A | B |' },
    isInitialLoading: false,
    isError: false,
  }),
}));

jest.mock('~/Providers', () => ({ useShareContext: () => ({ shareId: undefined }) }));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: () => ({ id: 'user-1' }),
}));

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const EXTRACTED_TEXT = /## Slide one/;
const PREVIEW_UNAVAILABLE = /Preview not available/i;

const renderDialog = (fileType: string, fileName: string, source?: FileSources) =>
  render(
    <FilePreviewDialog
      open={true}
      onOpenChange={() => {}}
      fileName={fileName}
      fileId="f1"
      fileType={fileType}
      fileSize={1024}
      source={source}
    />,
  );

describe('FilePreviewDialog', () => {
  beforeEach(() => mockDownload.mockClear());

  test.each([
    [PPTX, 'deck.pptx'],
    [DOCX, 'report.docx'],
    [XLSX, 'sheet.xlsx'],
  ])('shows extracted text instead of downloading the binary for %s', async (fileType, name) => {
    /* These MIME types contain the substring "xml" (…openxmlformats…). Before the
     * office check they matched the generic text branch, so the dialog downloaded
     * the binary and rendered its raw bytes as if it were a text file. */
    renderDialog(fileType, name, FileSources.text);

    expect(await screen.findByText(EXTRACTED_TEXT)).toBeInTheDocument();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  test('reports a stored PDF whose download fails as unavailable', async () => {
    /* A real PDF still in storage has no extracted text of its own. When its
     * download fails (deleted, expired, storage error) the honest answer is that
     * the preview is unavailable, not that the document parsed to nothing. */
    renderDialog('application/pdf', 'paper.pdf', FileSources.local);

    expect(await screen.findByText(PREVIEW_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(EXTRACTED_TEXT)).not.toBeInTheDocument();
  });

  test('falls back to the extracted text when a parsed PDF has no binary to fetch', async () => {
    /* A parsed record stores its text and no file, so the download is expected to
     * fail. Its text is the whole point of the record and must still be shown. */
    renderDialog('application/pdf', 'paper.pdf', FileSources.text);

    expect(await screen.findByText(EXTRACTED_TEXT)).toBeInTheDocument();
  });

  test('does not promise extracted text when the caller cannot supply the source', async () => {
    /* Call sites backed by search results carry no `source`. Defaulting the parsed
     * branch on would show an empty extracted-text panel for every stored PDF. */
    renderDialog('application/pdf', 'paper.pdf');

    expect(await screen.findByText(PREVIEW_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(EXTRACTED_TEXT)).not.toBeInTheDocument();
  });

  test('falls back to the extension when the MIME type is generic', async () => {
    /* Uploads do not always carry a precise type. `previewKind` already falls back
     * to the filename, so the parsed-document check does too, otherwise the dialog
     * claims no preview for a file whose text it holds. */
    renderDialog('application/octet-stream', 'report.docx', FileSources.text);

    expect(await screen.findByText(EXTRACTED_TEXT)).toBeInTheDocument();
  });

  test('still reports no preview for an unparsed binary', async () => {
    renderDialog('application/octet-stream', 'archive.bin', FileSources.local);

    expect(await screen.findByText(PREVIEW_UNAVAILABLE)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(EXTRACTED_TEXT)).not.toBeInTheDocument());
  });
});
