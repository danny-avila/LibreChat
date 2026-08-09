import path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import { mayEmbedMedia } from './media';

const fixturesDir = __dirname;
const readFixture = (name: string): Buffer => fs.readFileSync(path.join(fixturesDir, name));

const buildArchive = (entryNames: string[]): Promise<Buffer> => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  for (const name of entryNames) {
    zip.file(name, 'binary-ish');
  }
  return zip.generateAsync({ type: 'nodebuffer' });
};

describe('mayEmbedMedia', () => {
  it.each([
    ['a Word picture', 'word/media/image1.png'],
    ['a slide picture', 'ppt/media/image3.jpeg'],
    ['a worksheet picture', 'xl/media/image1.emf'],
    ['an OpenDocument picture', 'Pictures/10000201.png'],
  ])('reports %s', async (_label, entryName) => {
    expect(await mayEmbedMedia(await buildArchive([entryName]))).toBe(true);
  });

  it('ignores parts that merely reference artwork', async () => {
    const archive = await buildArchive([
      'word/document.xml',
      'word/_rels/document.xml.rels',
      'docProps/thumbnail.jpeg',
    ]);
    expect(await mayEmbedMedia(archive)).toBe(false);
  });

  it.each(['structured.docx', 'deck.pptx', 'sample.xlsx', 'sample.odt'])(
    'reports no media for the text-only fixture %s',
    async (name) => {
      expect(await mayEmbedMedia(readFixture(name))).toBe(false);
    },
  );

  /**
   * Legacy Office keeps pictures in Escher records inside an unnamed Compound File
   * stream, so no cheap read separates a scanned page from a document with none. The
   * default has to be the one that cannot silently lose content: these keep reaching a
   * configured OCR service, which is what they did before local parsing existed.
   */
  it('reports media for a legacy Compound File document it cannot inspect', async () => {
    expect(await mayEmbedMedia(readFixture('sample.xls'))).toBe(true);
  });

  it('reports no media for a format that embeds none', async () => {
    expect(await mayEmbedMedia(Buffer.from('name,value\na,1\n'))).toBe(false);
  });

  /** RTF is plain text, so the picture control word answers it exactly. */
  it.each([
    ['an RTF with a picture', String.raw`{\rtf1\ansi {\pict\pngblip 89504e47}}`, true],
    ['an RTF without one', String.raw`{\rtf1\ansi Hello}`, false],
  ])('reports %s', async (_label, rtf, expected) => {
    expect(await mayEmbedMedia(Buffer.from(rtf))).toBe(expected);
  });

  it('reports no media for a PDF, which the page-accounting parser handles', async () => {
    expect(await mayEmbedMedia(readFixture('sample.pdf'))).toBe(false);
  });

  /** EOCD intact so the tail still reads as an archive, central directory shredded. */
  it('reports no media for a corrupt archive instead of throwing', async () => {
    const archive = await buildArchive(['word/media/image1.png']);
    archive.fill(0, archive.length - 128, archive.length - 22);
    await expect(mayEmbedMedia(archive)).resolves.toBe(false);
  });
});
