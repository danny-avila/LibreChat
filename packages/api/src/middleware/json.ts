import { logger } from '@librechat/data-schemas';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware to handle JSON parsing errors from express.json()
 * Prevents user input from being reflected in error messages (XSS prevention)
 *
 * This middleware should be placed immediately after express.json() middleware.
 *
 * @param err - Error object from express.json()
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 *
 * @example
 * app.use(express.json({ limit: '3mb' }));
 * app.use(handleJsonParseError);
 */
export function handleJsonParseError(
  err: Error & { status?: number; body?: unknown },
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.warn('[JSON Parse Error] Invalid JSON received', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    res.status(400).json({
      error: 'Invalid JSON format',
      message: 'The request body contains malformed JSON',
    });
    return;
  }

  next(err);
}
