import { logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';

// eslint-disable-next-line no-control-regex
const unsafeChars = /[\r\n\u0000]/g;

export function apiNotFound(req: Request, res: Response): void {
  const safePath = req.path.replace(unsafeChars, '_').slice(0, 200);
  logger.debug(`[API 404] ${req.method} ${safePath}`);
  res.status(404).json({ message: 'Endpoint not found' });
}
