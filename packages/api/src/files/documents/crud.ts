import * as fs from 'fs';
import { megabyte, excelMimeTypes, FileSources } from 'librechat-data-provider';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { MistralOCRUploadResult } from '~/types';

type FileParseFn = (file: Express.Multer.File) => Promise<string>;

const DOCUMENT_PARSER_MAX_FILE_SIZE = 15 * megabyte;

/**
 * Parses an uploaded document and extracts its text content and metadata.
 * Handled types must stay in sync with `documentParserMimeTypes` from data-provider.
 *
 * @throws {Error} if `file.mimetype` is not handled, file exceeds size limit, or no text is found.
 */
export async function parseDocument({
  file,
}: {
  file: Express.Multer.File;
}): Promise<MistralOCRUploadResult> {
  const parseFn = getParserForMimeType(file.mimetype);
  if (!parseFn) {
    throw new Error(`Unsupported file type in document parser: ${file.mimetype}`);
  }

  const fileSize = file.size ?? (file.path != null ? (await fs.promises.stat(file.path)).size : 0);
  if (fileSize > DOCUMENT_PARSER_MAX_FILE_SIZE) {
    const limitMB = DOCUMENT_PARSER_MAX_FILE_SIZE / megabyte;
    const sizeMB = Math.ceil(fileSize / megabyte);
    throw new Error(
      `File "${file.originalname}" exceeds the ${limitMB}MB document parser limit (${sizeMB}MB).`,
    );
  }

  const text = await parseFn(file);

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

/** Maps a MIME type to its document parser function, or `undefined` if unsupported. */
function getParserForMimeType(mimetype: string): FileParseFn | undefined {
  if (mimetype === 'application/pdf') {
    return pdfToText;
  }
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return wordDocToText;
  }
  if (
    excelMimeTypes.test(mimetype) ||
    mimetype === 'application/vnd.oasis.opendocument.spreadsheet'
  ) {
    return excelSheetToText;
  }
  return undefined;
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
  const rawText = await extractRawText({ buffer: await fs.promises.readFile(file.path) });
  return rawText.value;
}

/** Parses Excel sheet, returns text inside. */
async function excelSheetToText(file: Express.Multer.File): Promise<string> {
  // xlsx CDN build (0.20.x) does not bind fs internally when dynamically imported;
  // readFile() fails with "Cannot access file". read() takes a pre-loaded Buffer instead.
  const { read, utils } = await import('xlsx');
  const data = await fs.promises.readFile(file.path);
  const workbook = read(data, { type: 'buffer' });

  let text = '';
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const worksheetAsCsvString = utils.sheet_to_csv(worksheet);
    text += `${sheetName}:\n${worksheetAsCsvString}\n`;
  }

  return text;
}
