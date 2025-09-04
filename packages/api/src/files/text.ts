import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { Request as ServerRequest } from 'express';
import { generateShortLivedToken } from '~/crypto/jwt';

/**
 * Attempts to parse text using RAG API, falls back to native text parsing
 * @param {Object} params - The parameters object
 * @param {Express.Request} params.req - The Express request object
 * @param {Express.Multer.File} params.file - The uploaded file
 * @param {string} params.file_id - The file ID
 * @returns {Promise<{text: string, bytes: number, source: string}>}
 */
export async function parseText({
  req,
  file,
  file_id,
}: {
  req: Pick<ServerRequest, 'user'> & {
    user?: { id: string };
  };
  file: Express.Multer.File;
  file_id: string;
}): Promise<{ text: string; bytes: number; source: string }> {
  if (!process.env.RAG_API_URL) {
    logger.debug('[parseText] RAG_API_URL not defined, falling back to native text parsing');
    return parseTextNative(file);
  }

  if (!req.user?.id) {
    logger.debug('[parseText] No user ID provided, falling back to native text parsing');
    return parseTextNative(file);
  }

  try {
    const healthResponse = await axios.get(`${process.env.RAG_API_URL}/health`, {
      timeout: 5000,
    });
    if (healthResponse?.statusText !== 'OK' && healthResponse?.status !== 200) {
      logger.debug('[parseText] RAG API health check failed, falling back to native parsing');
      return parseTextNative(file);
    }
  } catch (healthError) {
    logger.debug(
      '[parseText] RAG API health check failed, falling back to native parsing',
      healthError,
    );
    return parseTextNative(file);
  }

  try {
    const jwtToken = generateShortLivedToken(req.user.id);
    const formData = new FormData();
    formData.append('file_id', file_id);
    formData.append('file', fs.createReadStream(file.path));

    const formHeaders = formData.getHeaders();

    const response = await axios.post(`${process.env.RAG_API_URL}/text`, formData, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        accept: 'application/json',
        ...formHeaders,
      },
      timeout: 30000,
    });

    const responseData = response.data;
    logger.debug('[parseText] Response from RAG API', responseData);

    if (!('text' in responseData)) {
      throw new Error('RAG API did not return parsed text');
    }

    return {
      text: responseData.text,
      bytes: Buffer.byteLength(responseData.text, 'utf8'),
      source: FileSources.text,
    };
  } catch (error) {
    logger.warn('[parseText] RAG API text parsing failed, falling back to native parsing', error);
    return parseTextNative(file);
  }
}

/**
 * Native JavaScript text parsing fallback
 * Simple text file reading - complex formats handled by RAG API
 * @param {Express.Multer.File} file - The uploaded file
 * @returns {{text: string, bytes: number, source: string}}
 */
export function parseTextNative(file: Express.Multer.File): {
  text: string;
  bytes: number;
  source: string;
} {
  try {
    const text = fs.readFileSync(file.path, 'utf8');
    const bytes = Buffer.byteLength(text, 'utf8');

    return {
      text,
      bytes,
      source: FileSources.text,
    };
  } catch (error) {
    console.error('[parseTextNative] Failed to parse file:', error);
    throw new Error(`Failed to read file as text: ${error}`);
  }
}
