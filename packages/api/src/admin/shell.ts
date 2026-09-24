import fs from 'fs';
import path from 'path';

import type { Request, Response } from 'express';
import type { CspPolicy } from '../security/csp';

import { applyCspNonce, issueCsp, shellCacheHeaders } from '../security/csp';

export interface AdminShellDeps {
  distPath: string;
  cspPolicy: CspPolicy | null;
}

export type AdminShellSender = (req: Request, res: Response) => void;

/**
 * Serves the Klima admin shell from its own build, stamping the response nonce the way the
 * LibreChat shell does so an enabled CSP does not block the page. The HTML is read once at
 * startup; an unbuilt panel answers 503 rather than falling through to the LibreChat shell.
 */
export function createAdminShellSender({ distPath, cspPolicy }: AdminShellDeps): AdminShellSender {
  const indexPath = path.join(distPath, 'index.html');
  const cacheHeaders = shellCacheHeaders(cspPolicy != null);
  const html = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : null;

  return (_req, res) => {
    if (html == null) {
      res.status(503).type('text/plain').send('The Klima admin panel has not been built.');
      return;
    }

    res.set(cacheHeaders);

    if (!cspPolicy) {
      res.type('html').send(html);
      return;
    }

    const csp = issueCsp(cspPolicy);
    res.set(csp.headerName, csp.headerValue);
    res.type('html').send(applyCspNonce(html, csp.nonce));
  };
}
