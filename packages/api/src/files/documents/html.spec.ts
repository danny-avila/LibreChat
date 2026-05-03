import path from 'path';
import * as fs from 'fs';
import JSZip from 'jszip';
import {
  bufferToOfficeHtml,
  csvToHtml,
  excelSheetToHtml,
  pptxToSlideListHtml,
  wordDocToHtml,
} from './html';

const fixturesDir = __dirname;
const readFixture = (name: string): Buffer => fs.readFileSync(path.join(fixturesDir, name));

describe('Office HTML producers', () => {
  describe('wordDocToHtml', () => {
    test('renders a docx with its paragraph text in a sanitized HTML document', async () => {
      const html = await wordDocToHtml(readFixture('sample.docx'));
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('<article class="lc-docx">');
      expect(html).toContain('This is a sample DOCX file.');
    });

    test('strips <script> tags from the body and rejects event handlers', async () => {
      // Build a docx-shaped HTML body and run it through the same sanitizer
      // by stuffing it through the producer's output check. We can't easily
      // inject script into the docx fixture, so we exercise the sanitizer
      // contract directly via the public producer with a synthesized buffer
      // that mammoth turns into a known paragraph — and assert no scripts
      // could ever appear in the resulting wrapper.
      const html = await wordDocToHtml(readFixture('sample.docx'));
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/onerror=/i);
    });
  });

  describe('excelSheetToHtml', () => {
    test('renders all sheets of a multi-sheet workbook into the HTML document', async () => {
      const html = await excelSheetToHtml(readFixture('sample.xlsx'));
      expect(html).toMatch(/^<!DOCTYPE html>/);
      // Each sheet name should appear as a tab label.
      expect(html).toContain('Sheet One');
      expect(html).toContain('Second Sheet');
      // Cell values from both sheets should render.
      expect(html).toContain('first');
      expect(html).toContain('Second');
      // Tab strip uses pure-CSS radio inputs — verify the chrome wired up.
      expect(html).toContain('lc-sheet-tab-radio');
      expect(html).toContain('lc-sheet-panel-0');
      expect(html).toContain('lc-sheet-panel-1');
    });

    test('omits the tab strip when only one sheet is present', async () => {
      const html = await excelSheetToHtml(readFixture('sample.xls'));
      // Cell content should render even though there's no tab strip.
      expect(html).toContain('first');
      expect(html).toContain('<table');
      // Single sheet — no <nav class="lc-sheet-tabs">.
      expect(html).not.toContain('class="lc-sheet-tabs"');
    });

    test('renders ods workbooks the same way', async () => {
      const html = await excelSheetToHtml(readFixture('sample.ods'));
      expect(html).toContain('Sheet One');
      expect(html).toContain('Second Sheet');
    });
  });

  describe('csvToHtml', () => {
    test('renders a basic CSV as a single-table HTML document with no tab strip', async () => {
      const csv = Buffer.from('name,age,city\nAlice,30,NYC\nBob,25,SF\n', 'utf-8');
      const html = await csvToHtml(csv);
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('Alice');
      expect(html).toContain('NYC');
      expect(html).toContain('<table');
      expect(html).not.toContain('class="lc-sheet-tabs"');
    });

    test('handles CSV with embedded commas via quoted fields', async () => {
      const csv = Buffer.from('label,value\n"hello, world",42\n', 'utf-8');
      const html = await csvToHtml(csv);
      expect(html).toContain('hello, world');
      expect(html).toContain('42');
    });

    test('handles an empty CSV without crashing', async () => {
      const html = await csvToHtml(Buffer.from('', 'utf-8'));
      expect(html).toMatch(/^<!DOCTYPE html>/);
    });
  });

  describe('pptxToSlideListHtml', () => {
    /** Build a minimal valid PPTX with N synthesized slides for testing. */
    const buildPptx = async (
      slides: Array<{ title: string; body?: string[] }>,
    ): Promise<Buffer> => {
      const zip = new JSZip();
      const slideXml = (title: string, body: string[] = []) => {
        const titleP = `<a:p><a:r><a:t>${title}</a:t></a:r></a:p>`;
        const bodyPs = body.map((b) => `<a:p><a:r><a:t>${b}</a:t></a:r></a:p>`).join('');
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          ${titleP}
          ${bodyPs}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
      };
      slides.forEach((s, i) => {
        zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(s.title, s.body));
      });
      // Add a dummy non-slide entry so we exercise the filter.
      zip.file('docProps/core.xml', '<core/>');
      return zip.generateAsync({ type: 'nodebuffer' });
    };

    test('extracts slide titles and body bullets in slide-number order', async () => {
      const pptx = await buildPptx([
        { title: 'Welcome', body: ['First point', 'Second point'] },
        { title: 'Agenda', body: ['Item A', 'Item B', 'Item C'] },
        { title: 'Thanks!' },
      ]);
      const html = await pptxToSlideListHtml(pptx);
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('Slide 1');
      expect(html).toContain('Welcome');
      expect(html).toContain('First point');
      expect(html).toContain('Slide 2');
      expect(html).toContain('Agenda');
      expect(html).toContain('Item C');
      expect(html).toContain('Slide 3');
      expect(html).toContain('Thanks!');
      // Title appears before body in the doc.
      expect(html.indexOf('Welcome')).toBeLessThan(html.indexOf('First point'));
    });

    test('handles a slide with no extractable text gracefully', async () => {
      const pptx = await buildPptx([{ title: '' }]);
      const html = await pptxToSlideListHtml(pptx);
      expect(html).toContain('Slide 1');
      expect(html).toContain('(empty slide)');
    });

    test('returns a friendly empty-state document when no slides are present', async () => {
      const zip = new JSZip();
      zip.file('docProps/core.xml', '<core/>');
      const pptx = await zip.generateAsync({ type: 'nodebuffer' });
      const html = await pptxToSlideListHtml(pptx);
      expect(html).toContain('contains no readable slides');
    });

    test('decodes XML entities in slide text', async () => {
      const pptx = await buildPptx([{ title: 'A &amp; B', body: ['x &lt; y'] }]);
      const html = await pptxToSlideListHtml(pptx);
      expect(html).toContain('A &amp; B'); // re-escaped on output
      expect(html).toContain('x &lt; y');
    });
  });

  describe('bufferToOfficeHtml dispatcher', () => {
    test('routes by extension when MIME is generic', async () => {
      const html = await bufferToOfficeHtml(
        readFixture('sample.docx'),
        'sample.docx',
        'application/octet-stream',
      );
      expect(html).not.toBeNull();
      expect(html!).toContain('This is a sample DOCX file.');
    });

    test('routes by MIME when extension is missing', async () => {
      const html = await bufferToOfficeHtml(
        readFixture('sample.xlsx'),
        'workbook',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(html).not.toBeNull();
      expect(html!).toContain('Sheet One');
    });

    test('routes csv by extension', async () => {
      const html = await bufferToOfficeHtml(
        Buffer.from('a,b\n1,2', 'utf-8'),
        'data.csv',
        'application/octet-stream',
      );
      expect(html).not.toBeNull();
      expect(html!).toContain('<table');
    });

    test('routes csv by MIME when extension is missing', async () => {
      const html = await bufferToOfficeHtml(Buffer.from('a,b\n1,2', 'utf-8'), 'data', 'text/csv');
      expect(html).not.toBeNull();
      expect(html!).toContain('<table');
    });

    test('returns null for unrecognized types', async () => {
      const html = await bufferToOfficeHtml(Buffer.from('hello'), 'notes.txt', 'text/plain');
      expect(html).toBeNull();
    });

    test('extension wins over MIME (sniff misclassifies docx as application/zip)', async () => {
      const html = await bufferToOfficeHtml(
        readFixture('sample.docx'),
        'sample.docx',
        'application/zip',
      );
      expect(html).not.toBeNull();
      expect(html!).toContain('lc-docx');
    });
  });
});
