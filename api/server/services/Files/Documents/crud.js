const fs = require('fs');
const { FileSources } = require('librechat-data-provider');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

/**
 * Retrieves a readable stream for a file from local storage.
 *
 * Throws an Error if it fails to parse.
 *
 * @param {Express.Multer.File} file - The file.
 * @returns {MistralOCRUploadResult} A readable stream of the file.
 */
async function parseDocument({ file }) {
  let text;
  switch (file.mimetype) {
    case 'application/pdf':
      text = await pdfToText(file);
      break;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      text = await wordDocToText(file);
      break;
    case 'application/vnd.ms-excel':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      text = excelSheetToText(file);
      break;
    default:
      throw new Error(`Unsupported file type in document parser: ${file.mimetype}`);
  }

  if (!text?.trim()) {
    throw Error('No text found in document');
  }

  return {
    filename: file.filename,
    bytes: text.length * 4,
    filepath: FileSources.document_parser,
    text,
    images: [],
  };
}

/**
 * Parses PDF, returns text inside.
 *
 * @param {Express.Multer.File} file - The file.
 * @returns {Promise<string>} the text contents of the PDF.
 */
async function pdfToText(file) {
  // Imported inline so that Jest can test other routes without failing due to loading ESM
  const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(fs.readFileSync(file.path));
  const pdf = await getDocument({ data }).promise;

  // Extract text from all pages
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

/**
 * Parses Word document, returns text inside.
 *
 * @param {Express.Multer.File} file - The file.
 * @returns {Promise<string>} the text contents of the Word document.
 */
async function wordDocToText(file) {
  const rawText = await mammoth.extractRawText({ path: file.path });
  return rawText.value;
}

/**
 * Parses Excel sheet, returns text inside.
 *
 * @param {Express.Multer.File} file - The file.
 * @returns {string} the text contents of the XLS/XLSX.
 */
function excelSheetToText(file) {
  const workbook = XLSX.readFile(file.path);

  let text = '';
  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const worksheetAsCsvString = XLSX.utils.sheet_to_csv(worksheet);
    text += `${sheetName}:\n${worksheetAsCsvString}\n`;
  });

  return text;
}

module.exports = { parseDocument };
