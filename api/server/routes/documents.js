const express = require('express');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.use(requireJwtAuth);

/**
 * Splits a line on **bold** markers, returning an array of TextRun objects.
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
 * Supports: # headings, - bullets, **bold** inline, blank lines, plain text.
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

router.post('/docx', async (req, res) => {
  try {
    const { content, title = 'Assignment' } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const doc = new Document({
      sections: [{ children: markdownToParagraphs(content) }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${title.replace(/[^a-z0-9]/gi, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

module.exports = router;
