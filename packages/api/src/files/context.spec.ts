import type { TFile } from 'librechat-data-provider';
import { buildAttachmentManifest, getAttachmentTitleText } from './context';

const file = (filename?: string): TFile => ({ filename }) as TFile;

describe('getAttachmentTitleText', () => {
  it('returns an empty string when there are no files', () => {
    expect(getAttachmentTitleText()).toBe('');
    expect(getAttachmentTitleText(null)).toBe('');
    expect(getAttachmentTitleText([])).toBe('');
  });

  it('lists a single filename', () => {
    expect(getAttachmentTitleText([file('report.pdf')])).toBe('Attached file(s): report.pdf');
  });

  it('lists every filename', () => {
    expect(getAttachmentTitleText([file('a.pdf'), file('b.csv')])).toBe(
      'Attached file(s): a.pdf, b.csv',
    );
  });

  it('skips files that carry no filename', () => {
    expect(getAttachmentTitleText([file(), file('kept.txt')])).toBe('Attached file(s): kept.txt');
  });

  it('returns an empty string when no file has a filename', () => {
    expect(getAttachmentTitleText([file(), file()])).toBe('');
  });
});

describe('buildAttachmentManifest', () => {
  const codeConsumers = { executeCode: true, fileSearch: false };
  const searchConsumers = { executeCode: false, fileSearch: true };

  const attachment = (overrides: Partial<TFile> = {}): TFile =>
    ({
      filename: 'report.pdf',
      type: 'application/pdf',
      bytes: 2 * 1024 * 1024 + 100 * 1024,
      ...overrides,
    }) as TFile;

  it('returns undefined without attachments or consumers', () => {
    expect(buildAttachmentManifest({ attachments: [], fileConsumers: codeConsumers })).toBe(
      undefined,
    );
    expect(buildAttachmentManifest({ attachments: [attachment()] })).toBe(undefined);
  });

  it('advertises the code environment path for a file run code can read', () => {
    const manifest = buildAttachmentManifest({
      attachments: [attachment()],
      fileConsumers: codeConsumers,
    });
    expect(manifest).toBe(
      "Attached file(s) delivered out-of-band to this turn's tools:\n" +
        '- `report.pdf` (application/pdf, 2.1 MB) — in the code environment at `/mnt/data/report.pdf`',
    );
  });

  it('aligns the advertised path with the sandbox mount name for images', () => {
    const manifest = buildAttachmentManifest({
      attachments: [attachment({ filename: 'photo', type: 'image/png', bytes: 512 })],
      fileConsumers: codeConsumers,
    });
    expect(manifest).toContain(
      '`photo` (image/png, 512 B) — in the code environment at `/mnt/data/photo.png`',
    );
  });

  it('advertises file search for a provisioned record and only then', () => {
    const manifest = buildAttachmentManifest({
      attachments: [attachment({ type: 'text/plain', bytes: 3 * 1024, embedded: true })],
      fileConsumers: searchConsumers,
    });
    expect(manifest).toContain(
      '- `report.pdf` (text/plain, 3 KB) — available to the file_search tool',
    );

    expect(
      buildAttachmentManifest({
        attachments: [attachment({ type: 'text/plain', embedded: false })],
        fileConsumers: searchConsumers,
      }),
    ).toBe(undefined);
  });

  it('prefers the code environment line when both tools can read the file', () => {
    const manifest = buildAttachmentManifest({
      attachments: [attachment({ type: 'text/plain', embedded: true })],
      fileConsumers: { executeCode: true, fileSearch: true },
    });
    expect(manifest).toContain('in the code environment at `/mnt/data/report.pdf`');
    expect(manifest).not.toContain('file_search');
  });

  it('omits files no running tool can read', () => {
    const video = attachment({ filename: 'clip.mp4', type: 'video/mp4' });
    expect(buildAttachmentManifest({ attachments: [video], fileConsumers: codeConsumers })).toBe(
      undefined,
    );
  });

  it('skips records without a filename or type', () => {
    expect(
      buildAttachmentManifest({
        attachments: [attachment({ type: undefined }), attachment({ filename: undefined })],
        fileConsumers: codeConsumers,
      }),
    ).toBe(undefined);
  });
});
