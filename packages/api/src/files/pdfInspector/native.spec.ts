import path from 'path';
import * as fs from 'fs';
import { extractPagesMarkdownIsolated, extractTextIsolated } from './native';

/**
 * Exercises the real child process against the real native binding. Nothing is mocked
 * here on purpose: the point of this module is what happens at the process
 * boundary, which a stubbed binding cannot demonstrate.
 */
describe('pdfInspector native', () => {
  const fixture = (name: string) => path.join(__dirname, '..', 'documents', name);

  test('extracts per-page markdown outside the API process', async () => {
    const pages = await extractPagesMarkdownIsolated(fixture('sample.pdf'));

    expect(pages.length).toBeGreaterThan(0);
    const markdown = pages.map((page) => page.markdown).join('\n');
    expect(markdown).toContain('Quarterly Report');
    /** Layout recovery is the reason for using this engine over the flat extractor. */
    expect(markdown).toContain('|Region|Units|Revenue|');
  });

  test('extracts whole-document plain text outside the API process', async () => {
    const text = await extractTextIsolated(fixture('sample.pdf'));

    expect(text).toContain('Quarterly Report');
  });

  test('surfaces a native parse failure as a rejection rather than a crash', async () => {
    /* pdf-inspector refuses a damaged xref table that pdfjs would rebuild. In-process
     * this arrived as a thrown napi error; across the child boundary it has to
     * arrive as a rejection, because that is what routes the caller to pdfjs. */
    await expect(extractPagesMarkdownIsolated(fixture('sample-badxref.pdf'))).rejects.toThrow(
      /Invalid PDF structure/,
    );
  });

  test('a missing file rejects instead of leaving the caller hanging', async () => {
    await expect(extractTextIsolated(fixture('does-not-exist.pdf'))).rejects.toThrow();
  });

  test('the event loop stays responsive while a parse runs', async () => {
    /* The whole point of the child. `extractPagesMarkdown` is a synchronous napi
     * call, so inline it pins the loop for the entire parse: measured on this shape
     * of document, 1152ms of wall time produced 1152ms of event-loop lag, versus 5ms
     * across the process boundary. The assertion is on the longest gap between timer
     * ticks, which tracks the whole blocked interval when the loop is pinned and
     * stays near the tick period when it is not. */
    const wide = path.join(__dirname, 'sample-wide.pdf');
    fs.writeFileSync(wide, buildManyPagePdf(20_000));
    try {
      let longestGap = 0;
      let previousTick = Date.now();
      const ticker = setInterval(() => {
        const now = Date.now();
        longestGap = Math.max(longestGap, now - previousTick);
        previousTick = now;
      }, 5);

      const start = Date.now();
      try {
        await extractPagesMarkdownIsolated(wide);
        /* Let the timer observe the interval that just elapsed; without this the
         * gap spanning a blocking call would never be recorded. */
        await new Promise((resolve) => setTimeout(resolve, 30));
      } finally {
        clearInterval(ticker);
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThan(50);
      /* Generous against a loaded CI box while still failing outright if the parse
       * ever moves back into the API process, where the gap equals the wall time. */
      expect(longestGap).toBeLessThan(elapsed / 2);
    } finally {
      fs.unlinkSync(wide);
    }
  }, 30_000);
});

/** Minimal multi-page PDF: enough page objects to make the parse measurable. */
function buildManyPagePdf(pageCount: number): Buffer {
  const objects = [
    `1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n`,
    `2 0 obj\n<</Type/Pages/Kids[${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(
      ' ',
    )}]/Count ${pageCount}>>\nendobj\n`,
    ...Array.from(
      { length: pageCount },
      (_, i) => `${i + 3} 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>\nendobj\n`,
    ),
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(body, 'latin1');
}
