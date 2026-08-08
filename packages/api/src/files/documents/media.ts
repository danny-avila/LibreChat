import yauzl from 'yauzl';
import { isZipArchive } from './zipSafety';

/**
 * Where the zip-backed document formats keep embedded artwork. OOXML puts every
 * picture under `<part>/media/` and ODF under `Pictures/`; the XML parts a converter
 * reads carry references to them, never pixels. A scanned page inside a DOCX or a
 * deck is therefore always one of these entries, and nothing else is.
 */
const MEDIA_ENTRY = /^(?:word|ppt|xl)\/media\/|^Pictures\//i;

/**
 * Whether a document embeds artwork whose content a text converter cannot read.
 *
 * AnyDoc returns Markdown with no page accounting, so a deck of scanned slides comes
 * back looking as complete as one with no images at all. This is the missing-content
 * signal that lets the upload path escalate to a configured OCR service only for
 * documents that actually carry something OCR could recover.
 *
 * Only the central directory is walked (entry names, no decompression), and a
 * malformed or non-zip buffer reports `false` rather than throwing: the zip-bomb guard
 * owns rejection, and an unreadable container is the parser's error to raise, not this
 * one's. Legacy binary formats (`.doc`, `.xls`, `.ppt`) are not archives and so never
 * report media, which leaves them on local extraction alone.
 */
export function hasEmbeddedMedia(buffer: Buffer): Promise<boolean> {
  if (!isZipArchive(buffer)) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        resolve(false);
        return;
      }

      let settled = false;
      const finish = (found: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          zipfile.close();
        } catch {
          /* Best-effort: yauzl throws when closing mid-walk, and the answer is already out. */
        }
        resolve(found);
      };

      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (MEDIA_ENTRY.test(entry.fileName)) {
          finish(true);
          return;
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => finish(false));
      zipfile.on('error', () => finish(false));
      zipfile.readEntry();
    });
  });
}
