import { logger } from '@librechat/data-schemas';
import type {
  TextItem,
  PDFDocumentProxy,
  TextMarkedContent,
  PDFDocumentLoadingTask,
} from 'pdfjs-dist/types/src/display/api';

/**
 * Flat text extraction with pdfjs, shared by the two callers that need it: the
 * pdf-inspector parser, which repairs the pages that engine drops, and the
 * document parser, whose fallback chain ends here because pdfjs reconstructs
 * damaged xref tables that pdf-inspector rejects outright.
 */

/**
 * Reads the raw text layer of specific 0-indexed pages.
 *
 * Failure here must not fail the document: pages that cannot be recovered are
 * reported in `pagesNeedingOcr` instead, so an unavailable or broken pdfjs
 * degrades to a visible omission notice rather than a parse error.
 */
export async function extractPageText(
  data: Buffer,
  pageIndexes: number[],
): Promise<Map<number, string>> {
  const texts = new Map<number, string>();
  let loadingTask: PDFDocumentLoadingTask | undefined;
  try {
    // Imported inline so that Jest can test other routes without failing due to loading ESM
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    loadingTask = getDocument({ data: new Uint8Array(data) });
    const pdf: PDFDocumentProxy = await loadingTask.promise;

    for (const pageIndex of pageIndexes) {
      try {
        const page = await pdf.getPage(pageIndex + 1);
        const textContent = await page.getTextContent();
        texts.set(pageIndex, joinTextItems(textContent.items));
      } catch {
        /* An unreadable page is reported in pagesNeedingOcr rather than failing the document. */
      }
    }
  } catch (error) {
    logger.warn('[pdfjs] unavailable for page recovery:', error);
  } finally {
    /* pdfjs holds the decoded document and its worker until the loading task is
     * destroyed; without this the buffer stays reachable for the whole request. */
    await loadingTask?.destroy();
  }
  return texts;
}

/** Reads the raw text layer of every page, joined in document order. */
export async function extractDocumentText(data: Buffer): Promise<string> {
  // Imported inline so that Jest can test other routes without failing due to loading ESM
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = getDocument({ data: new Uint8Array(data) });
  try {
    const pdf: PDFDocumentProxy = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += joinTextItems(textContent.items) + '\n';
    }

    return fullText;
  } finally {
    await loadingTask.destroy();
  }
}

/** Marked content items carry no `str`, so only genuine text items contribute. */
function joinTextItems(items: (TextItem | TextMarkedContent)[]): string {
  return items
    .filter((item): item is TextItem => !('type' in item))
    .map((item) => item.str)
    .join(' ');
}
