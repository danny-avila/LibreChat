import yauzl from 'yauzl';
import { isZipArchive } from './zipSafety';

/**
 * Where the zip-backed document formats keep embedded artwork. OOXML puts every
 * picture under `<part>/media/` and ODF under `Pictures/`; the XML parts a converter
 * reads carry references to them, never pixels. A scanned page inside a DOCX or a
 * deck is therefore always one of these entries, and nothing else is.
 */
const MEDIA_ENTRY = /^(?:word|ppt|xl)\/media\/|^Pictures\//i;

/** Compound File Binary header, the container behind `.doc`, `.xls` and `.ppt`. */
const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** RTF is plain text, and every embedded picture opens with this control word. */
const RTF_SIGNATURE = Buffer.from('{\\rt');
const RTF_PICTURE = Buffer.from('\\pict');

/** Legacy Office documents store pictures in Escher records with no addressable name. */
function isLegacyOfficeContainer(buffer: Buffer): boolean {
  return buffer.subarray(0, CFB_SIGNATURE.length).equals(CFB_SIGNATURE);
}

function zipContainsMedia(buffer: Buffer): Promise<boolean> {
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

/**
 * Whether a document may embed artwork whose content a text converter cannot read.
 *
 * AnyDoc returns Markdown with no page accounting, so a deck of scanned slides comes
 * back looking as complete as one with no images at all. This is the missing-content
 * signal that lets the upload path escalate to a configured OCR service, and its
 * contract is deliberately "may", not "does": a false negative silently loses a
 * scanned page, while a false positive costs one OCR call on a document that had
 * nothing to recover.
 *
 * Each container is answered as precisely as it can be:
 *
 * - Zip-backed (OOXML, ODF, EPUB): the central directory is walked for media entry
 *   names. No decompression, and a malformed archive reports `false` because the
 *   zip-bomb guard owns rejection and the parser owns the read error.
 * - RTF: plain text, so the `\pict` control word answers it exactly.
 * - Legacy Office (`.doc`, `.xls`, `.ppt`): pictures live in Escher records inside a
 *   Compound File stream with no addressable name, and no cheap read distinguishes a
 *   scanned page from a document with none. Reported as media so these keep reaching
 *   a configured OCR service, which is what they did before local parsing existed.
 * - Everything else (CSV and other flat text): nothing to embed, so `false`.
 */
export async function mayEmbedMedia(buffer: Buffer): Promise<boolean> {
  if (isZipArchive(buffer)) {
    return zipContainsMedia(buffer);
  }
  if (isLegacyOfficeContainer(buffer)) {
    return true;
  }
  if (buffer.subarray(0, RTF_SIGNATURE.length).equals(RTF_SIGNATURE)) {
    return buffer.includes(RTF_PICTURE);
  }
  return false;
}
