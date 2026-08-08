import path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import { hasEmbeddedMedia } from './media';

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

describe('hasEmbeddedMedia', () => {
  it.each([
    ['a Word picture', 'word/media/image1.png'],
    ['a slide picture', 'ppt/media/image3.jpeg'],
    ['a worksheet picture', 'xl/media/image1.emf'],
    ['an OpenDocument picture', 'Pictures/10000201.png'],
  ])('reports %s', async (_label, entryName) => {
    expect(await hasEmbeddedMedia(await buildArchive([entryName]))).toBe(true);
  });

  it('ignores parts that merely reference artwork', async () => {
    const archive = await buildArchive([
      'word/document.xml',
      'word/_rels/document.xml.rels',
      'docProps/thumbnail.jpeg',
    ]);
    expect(await hasEmbeddedMedia(archive)).toBe(false);
  });

  it.each(['structured.docx', 'deck.pptx', 'sample.xlsx', 'sample.odt'])(
    'reports no media for the text-only fixture %s',
    async (name) => {
      expect(await hasEmbeddedMedia(readFixture(name))).toBe(false);
    },
  );

  /**
   * Legacy binary formats are not archives, and a truncated container is the parser's
   * error to raise. Neither can answer the question, and guessing "yes" would send
   * every one of them to a paid OCR service.
   */
  it.each([
    ['a non-archive', 'sample.xls'],
    ['a PDF', 'sample.pdf'],
  ])('reports no media for %s', async (_label, name) => {
    expect(await hasEmbeddedMedia(readFixture(name))).toBe(false);
  });

  /** EOCD intact so the tail still reads as an archive, central directory shredded. */
  it('reports no media for a corrupt archive instead of throwing', async () => {
    const archive = await buildArchive(['word/media/image1.png']);
    archive.fill(0, archive.length - 128, archive.length - 22);
    await expect(hasEmbeddedMedia(archive)).resolves.toBe(false);
  });
});
