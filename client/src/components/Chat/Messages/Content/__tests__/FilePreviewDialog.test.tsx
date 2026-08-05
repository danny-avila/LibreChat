import React from 'react';
import { render, screen } from '@testing-library/react';
import FilePreviewDialog from '../FilePreviewDialog';

const mockDownload = jest.fn().mockResolvedValue({ data: null });

jest.mock('~/data-provider', () => ({
  useFileDownload: () => ({ refetch: mockDownload }),
  useSharedFileDownload: () => ({ refetch: mockDownload }),
  useFilePreview: () => ({
    data: { file_id: 'f1', status: 'ready', text: '## Slide one\n\n| A | B |' },
    isLoading: false,
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

const renderDialog = (fileType: string, fileName: string) =>
  render(
    <FilePreviewDialog
      open={true}
      onOpenChange={() => {}}
      fileName={fileName}
      fileId="f1"
      fileType={fileType}
      fileSize={1024}
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
    renderDialog(fileType, name);

    expect(await screen.findByText(/## Slide one/)).toBeInTheDocument();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  test('leaves PDFs on their own inline preview', () => {
    renderDialog('application/pdf', 'paper.pdf');

    /* PDFs render inline, so they must not be diverted to the extracted-text panel. */
    expect(screen.queryByText(/## Slide one/)).not.toBeInTheDocument();
  });
});
