/**
 * Mistral OCR API Types
 * Based on https://docs.mistral.ai/api/#tag/ocr/operation/ocr_v1_ocr_post
 */

export interface MistralFileUploadResponse {
  id: string;
  object: string;
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
}

export interface MistralSignedUrlResponse {
  url: string;
  expires_at: number;
}

export interface OCRImage {
  image_base64?: string;
  caption?: string;
  bounding_box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCRResultPage {
  markdown: string;
  images?: OCRImage[];
  page_number?: number;
}

export interface OCRResult {
  id: string;
  object: string;
  created_at: number;
  model: string;
  pages: OCRResultPage[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface MistralOCRRequest {
  model: string;
  image_limit?: number;
  include_image_base64?: boolean;
  document: {
    type: 'document_url' | 'image_url';
    document_url?: string;
    image_url?: string;
  };
}

export interface MistralOCRError {
  detail?: string;
  message?: string;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export interface MistralOCRUploadResult {
  filename: string;
  bytes: number;
  filepath: string;
  text: string;
  images: string[];
}
