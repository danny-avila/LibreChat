const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Splits a line on **bold** markers, returning an array of TextRun objects.
 * @param {string} text
 */
function parseInline(text) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part) {
      runs.push(new TextRun({ text: part }));
    }
  }
  return runs.length ? runs : [new TextRun({ text: '' })];
}

/**
 * Converts a markdown string into an array of docx Paragraph objects.
 * Supports: # / ## / ### headings, - / * bullets, **bold** inline, blank
 * lines, plain text.
 * @param {string} markdown
 */
function markdownToParagraphs(markdown) {
  const lines = markdown.split('\n');
  const paragraphs = [];

  for (const line of lines) {
    if (line.startsWith('### ')) {
      paragraphs.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
    } else if (/^[-*] /.test(line)) {
      paragraphs.push(
        new Paragraph({ children: parseInline(line.slice(2)), bullet: { level: 0 } }),
      );
    } else if (line.trim() === '') {
      paragraphs.push(new Paragraph({ text: '' }));
    } else {
      paragraphs.push(new Paragraph({ children: parseInline(line) }));
    }
  }

  return paragraphs;
}

/**
 * Converts a markdown string into a .docx file Buffer.
 * Single source of truth for the markdown→Word conversion. Used by:
 *   - The hover-button download route (POST /api/documents/docx)
 *   - The streaming [DOCUMENT]-block auto-attach path
 *
 * @param {string} markdown
 * @returns {Promise<Buffer>}
 */
async function markdownToDocxBuffer(markdown) {
  const doc = new Document({
    sections: [{ children: markdownToParagraphs(markdown) }],
  });
  return Packer.toBuffer(doc);
}

/**
 * Sanitizes a freeform title into a filename-safe stem. Converts unsafe
 * characters to underscores, trims to a reasonable length.
 * @param {string} title
 */
function sanitizeFilenameStem(title) {
  return (title || 'document').toString().slice(0, 60).replace(/[^a-z0-9]/gi, '_');
}

/**
 * Tries to extract a reasonable filename stem from the markdown content
 * itself: the first H1 (or H2) heading. Falls back to "document".
 * @param {string} markdown
 */
function inferFilenameFromMarkdown(markdown) {
  const match = (markdown || '').match(/^\s{0,3}#{1,2}\s+(.+?)\s*$/m);
  if (match) {
    return sanitizeFilenameStem(match[1]);
  }
  return sanitizeFilenameStem('document');
}

module.exports = {
  DOCX_MIME,
  markdownToParagraphs,
  markdownToDocxBuffer,
  sanitizeFilenameStem,
  inferFilenameFromMarkdown,
};
