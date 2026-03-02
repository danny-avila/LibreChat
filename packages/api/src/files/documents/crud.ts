import * as fs from 'fs';
import { excelMimeTypes, FileSources } from 'librechat-data-provider';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { MistralOCRUploadResult } from '~/types';

/**
 * Parses an uploaded document and extracts its text content and metadata.
 * Handled types must stay in sync with `documentParserMimeTypes` from data-provider.
 *
 * @throws {Error} if `file.mimetype` is not handled or no text is found.
 */
export async function parseDocument({
  file,
}: {
  file: Express.Multer.File;
}): Promise<MistralOCRUploadResult> {
  let text: string;
  if (file.mimetype === 'application/pdf') {
    text = await pdfToText(file);
  } else if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    text = await wordDocToText(file);
  } else if (
    excelMimeTypes.test(file.mimetype) ||
    file.mimetype === 'application/vnd.oasis.opendocument.spreadsheet'
  ) {
    text = await excelSheetToText(file);
  } else {
    throw new Error(`Unsupported file type in document parser: ${file.mimetype}`);
  }

  if (!text?.trim()) {
    throw new Error('No text found in document');
  }

  return {
    filename: file.originalname,
    bytes: Buffer.byteLength(text, 'utf8'),
    filepath: FileSources.document_parser,
    text,
    images: [],
  };
}

/** Parses PDF, returns text inside. */
async function pdfToText(file: Express.Multer.File): Promise<string> {
  // Imported inline so that Jest can test other routes without failing due to loading ESM
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(await fs.promises.readFile(file.path));
  const pdf = await getDocument({ data }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .filter((item): item is TextItem => !('type' in item))
      .map((item) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

/** Parses Word document, returns text inside. */
async function wordDocToText(file: Express.Multer.File): Promise<string> {
  const { extractRawText } = await import('mammoth');
  const rawText = await extractRawText({ path: file.path });
  return rawText.value;
}

/** Parses Excel sheet, returns text inside. */
async function excelSheetToText(file: Express.Multer.File): Promise<string> {
  const { readFile, utils } = await import('xlsx');
  const workbook = readFile(file.path);

  let text = '';
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const worksheetAsCsvString = utils.sheet_to_csv(worksheet);
    text += `${sheetName}:\n${worksheetAsCsvString}\n`;
  }

  return text;
}
