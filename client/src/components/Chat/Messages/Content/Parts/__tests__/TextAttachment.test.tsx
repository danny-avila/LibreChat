import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AttachmentGroup, default as Attachment } from '../Attachment';
import type { TAttachment } from 'librechat-data-provider';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string => {
      const translations: Record<string, string> = {
        com_ui_show_all: 'Show all',
        com_ui_collapse: 'Collapse',
      };
      return translations[key] ?? key;
    },
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

jest.mock('~/components/Chat/Messages/Content/Image', () => ({
  __esModule: true,
  default: ({ altText }: { altText?: string }) => <img alt={altText ?? ''} data-testid="image" />,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

const textAttachment = (overrides: Partial<TAttachment> = {}): TAttachment =>
  ({
    file_id: 'file-1',
    filename: 'output.csv',
    filepath: '/files/output.csv',
    type: 'text/csv',
    text: 'a,b,c\n1,2,3',
    ...overrides,
  }) as TAttachment;

const setScrollHeight = (value: number) => {
  Object.defineProperty(HTMLPreElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return value;
    },
  });
};

describe('TextAttachment (via Attachment default export)', () => {
  beforeEach(() => {
    mockHandleDownload.mockReset();
    setScrollHeight(0);
  });

  it('renders the text content inside a <pre>', () => {
    const { container } = render(<Attachment attachment={textAttachment()} />);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe('a,b,c\n1,2,3');
  });

  it('renders a download chip when filepath is present', () => {
    render(<Attachment attachment={textAttachment()} />);
    expect(screen.getByTestId('file-container')).toBeInTheDocument();
  });

  it('hides the download chip when filepath is absent', () => {
    render(<Attachment attachment={textAttachment({ filepath: '' })} />);
    expect(screen.queryByTestId('file-container')).not.toBeInTheDocument();
  });

  it('does not render a show/collapse button when content fits', () => {
    setScrollHeight(100); // < COLLAPSED_MAX_HEIGHT (320)
    render(<Attachment attachment={textAttachment()} />);
    expect(screen.queryByRole('button', { name: /show all|collapse/i })).not.toBeInTheDocument();
  });

  it('renders an expand button with aria-expanded=false when content overflows', () => {
    setScrollHeight(800); // > COLLAPSED_MAX_HEIGHT (320)
    render(<Attachment attachment={textAttachment()} />);
    const button = screen.getByRole('button', { name: 'Show all' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls');
  });

  it('toggles aria-expanded and label when the button is clicked', () => {
    setScrollHeight(800);
    render(<Attachment attachment={textAttachment()} />);
    const button = screen.getByRole('button', { name: 'Show all' });
    act(() => {
      fireEvent.click(button);
    });
    const expanded = screen.getByRole('button', { name: 'Collapse' });
    expect(expanded).toHaveAttribute('aria-expanded', 'true');
  });

  it('falls through to FileAttachment when text is missing', () => {
    const noText = textAttachment({ text: undefined as unknown as string });
    render(<Attachment attachment={noText} />);
    // FileAttachment also renders the FileContainer mock — we assert the
    // <pre> is absent to confirm the text branch was not taken.
    expect(screen.queryByText('a,b,c\n1,2,3')).not.toBeInTheDocument();
    expect(screen.getByTestId('file-container')).toBeInTheDocument();
  });

  it('falls through to FileAttachment when text is the empty string', () => {
    const empty = textAttachment({ text: '' });
    const { container } = render(<Attachment attachment={empty} />);
    expect(container.querySelector('pre')).toBeNull();
    expect(screen.getByTestId('file-container')).toBeInTheDocument();
  });
});

describe('AttachmentGroup', () => {
  beforeEach(() => {
    setScrollHeight(0);
  });

  it('routes text-bearing attachments through the text rendering path', () => {
    const attachments = [textAttachment({ file_id: 'a', filename: 'a.txt' })] as TAttachment[];
    const { container } = render(<AttachmentGroup attachments={attachments} />);
    expect(container.querySelector('pre')).not.toBeNull();
  });

  it('routes plain-file attachments to the FileAttachment branch', () => {
    const attachments = [
      textAttachment({
        file_id: 'b',
        filename: 'archive.zip',
        type: 'application/zip',
        text: undefined as unknown as string,
      }),
    ] as TAttachment[];
    const { container } = render(<AttachmentGroup attachments={attachments} />);
    expect(container.querySelector('pre')).toBeNull();
    expect(screen.getAllByTestId('file-container').length).toBeGreaterThan(0);
  });
});
