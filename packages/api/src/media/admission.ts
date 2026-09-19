import type { Request, Response, RequestHandler } from 'express';
import type { MediaEnvironment } from './credentials';
import { isEnabled } from '../utils/common';

export interface MediaAdmissionPolicy {
  checkBan: RequestHandler;
  generationLimiters: readonly RequestHandler[];
  uploadLimiters: readonly RequestHandler[];
}
export interface MediaAdmissionDependencies {
  checkBan: RequestHandler;
  messageIpLimiter: RequestHandler;
  messageUserLimiter: RequestHandler;
  createFileLimiters(options: { onLimit: (req: Request, res: Response) => void }): {
    fileUploadIpLimiter: RequestHandler;
    fileUploadUserLimiter: RequestHandler;
  };
}

export function createMediaAdmissionPolicy(
  deps: MediaAdmissionDependencies,
  environment: MediaEnvironment,
): MediaAdmissionPolicy {
  const uploads = deps.createFileLimiters({
    onLimit: (_req, res) => {
      res.status(429).json({ error: { code: 'quota_exceeded' } });
    },
  });
  return {
    checkBan: deps.checkBan,
    generationLimiters: [
      ...(isEnabled(environment.LIMIT_MESSAGE_IP) ? [deps.messageIpLimiter] : []),
      ...(isEnabled(environment.LIMIT_MESSAGE_USER) ? [deps.messageUserLimiter] : []),
    ],
    uploadLimiters: [uploads.fileUploadIpLimiter, uploads.fileUploadUserLimiter],
  };
}
