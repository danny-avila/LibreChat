import type { ServerRequest } from './http';

/** Authentication value loader shared across OCR strategies */
export type LoadAuthValues = (params: {
  userId: string;
  authFields: string[];
  optional?: Set<string>;
}) => Promise<Record<string, string | undefined>>;

/** Context passed to every OCR strategy's upload handler */
export interface OCRContext {
  req: ServerRequest;
  file: Express.Multer.File;
  loadAuthValues: LoadAuthValues;
}

/**
 * Generic result contract every OCR strategy must satisfy.
 * Vendor-specific results (e.g. Mistral) extend this shape.
 */
export interface OCRUploadResult {
  filename: string;
  bytes: number;
  filepath: string;
  text: string;
  images: string[];
}

/** Signature implemented by any OCR strategy upload handler */
export type OCRStrategyFunction = (context: OCRContext) => Promise<OCRUploadResult>;
