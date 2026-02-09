/* eslint-disable @typescript-eslint/no-explicit-any */
import { extractFileContext } from '../context';
import { processTextWithTokenLimit } from '~/utils/text';

jest.mock('~/utils/text', () => ({
  processTextWithTokenLimit: jest.fn(),
}));

describe('extractFileContext', () => {
  const mockProcess = processTextWithTokenLimit as jest.MockedFunction<typeof processTextWithTokenLimit>;

  beforeEach(() => {
    mockProcess.mockResolvedValue({
      text: 'Hello',
      wasTruncated: false,
    });
  });

  it('should format a single file with default headers', async () => {
    const attachments = [
      {
        source: 'text' as any,
        filename: 'alpha.txt',
        text: 'Hello',
      },
    ];

    const result = await extractFileContext({
      attachments: attachments as any,
      tokenCountFn: (text) => text.length,
    });

    expect(result).toBe('Attached document(s):\n```md\n# "alpha.txt"\nHello\n\n```');
  });

  it('should omit filename headers when disabled', async () => {
    const attachments = [
      {
        source: 'text' as any,
        filename: 'alpha.txt',
        text: 'Hello',
      },
    ];

    const result = await extractFileContext({
      attachments: attachments as any,
      tokenCountFn: (text) => text.length,
      contextConfig: {
        showFilenameHeaders: false,
      },
    });

    expect(result).toBe('Attached document(s):\n```md\nHello\n\n```');
  });

  it('should apply a custom filename header template', async () => {
    const attachments = [
      {
        source: 'text' as any,
        filename: 'alpha.txt',
        text: 'Hello',
      },
    ];

    const result = await extractFileContext({
      attachments: attachments as any,
      tokenCountFn: (text) => text.length,
      contextConfig: {
        filenameHeaderTemplate: '## File: {filename}',
      },
    });

    expect(result).toBe('Attached document(s):\n```md\n## File: alpha.txt\nHello\n\n```');
  });

  it('should format multiple files with separators', async () => {
    const attachments = [
      {
        source: 'text' as any,
        filename: 'alpha.txt',
        text: 'Hello',
      },
      {
        source: 'text' as any,
        filename: 'beta.txt',
        text: 'World',
      },
    ];

    mockProcess
      .mockResolvedValueOnce({ text: 'Hello', wasTruncated: false })
      .mockResolvedValueOnce({ text: 'World', wasTruncated: false });

    const result = await extractFileContext({
      attachments: attachments as any,
      tokenCountFn: (text) => text.length,
    });

    expect(result).toBe(
      'Attached document(s):\n```md\n# "alpha.txt"\nHello\n\n---\n\n\n# "beta.txt"\nWorld\n\n```',
    );
  });

  it('should return undefined when no text attachments are present', async () => {
    const attachments = [
      {
        source: 'local' as any,
        filename: 'image.png',
        text: 'Hello',
      },
    ];

    const result = await extractFileContext({
      attachments: attachments as any,
      tokenCountFn: (text) => text.length,
    });

    expect(result).toBeUndefined();
  });
});
