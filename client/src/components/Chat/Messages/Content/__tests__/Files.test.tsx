import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileContext, FileSources } from 'librechat-data-provider';
import type { TFile, TMessage } from 'librechat-data-provider';
import Files from '../Files';

jest.mock('~/components/Chat/Input/Files/FileContainer', () => ({
  __esModule: true,
  default: ({
    file,
    disabled,
    onClick,
  }: {
    file: Partial<TFile>;
    disabled?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button
      type="button"
      data-testid={`file-chip-${file.file_id}`}
      disabled={disabled}
      onClick={onClick}
    >
      {file.filename}
    </button>
  ),
}));

jest.mock('../FilePreviewDialog', () => ({
  __esModule: true,
  default: ({ open, fileId }: { open: boolean; fileId?: string }) =>
    open ? <div data-testid="file-preview-dialog" data-file-id={fileId} /> : null,
}));

jest.mock('../Image', () => ({
  __esModule: true,
  default: ({ altText }: { altText: string }) => <img alt={altText} />,
}));

const messageWithFile = (file: Partial<TFile>): TMessage =>
  ({
    messageId: 'message-1',
    files: [
      {
        file_id: 'file-1',
        filename: 'example.txt',
        type: 'text/plain',
        bytes: 12,
        ...file,
      },
    ],
  }) as TMessage;

describe('message file previews', () => {
  it('disables previewing upload-as-text message attachments', () => {
    render(
      <Files
        message={messageWithFile({
          source: FileSources.text,
          context: FileContext.message_attachment,
        })}
      />,
    );

    const chip = screen.getByTestId('file-chip-file-1');
    expect(chip).toBeDisabled();

    fireEvent.click(chip);

    expect(screen.queryByTestId('file-preview-dialog')).not.toBeInTheDocument();
  });

  it('keeps normal message attachments previewable', () => {
    render(
      <Files
        message={messageWithFile({
          source: FileSources.local,
          context: FileContext.message_attachment,
        })}
      />,
    );

    const chip = screen.getByTestId('file-chip-file-1');
    expect(chip).not.toBeDisabled();

    fireEvent.click(chip);

    expect(screen.getByTestId('file-preview-dialog')).toHaveAttribute('data-file-id', 'file-1');
  });
});
