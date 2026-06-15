import type { Request, Response, NextFunction } from 'express';

/**
 * Enforces a maximum serialized JSON body size after express.json() has parsed the request.
 * Use when route-level body-parser limits are ineffective because a global parser runs first.
 */
export function enforceJsonBodySizeLimit(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.body != null && Buffer.byteLength(JSON.stringify(req.body), 'utf8') > maxBytes) {
      res.status(413).json({ error: 'Request body too large' });
      return;
    }
    next();
  };
}
