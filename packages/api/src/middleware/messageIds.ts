import type { Request, Response, NextFunction } from 'express';
import {
  MAX_MESSAGE_ID_LENGTH,
  MAX_RESPONSE_MESSAGE_ID_LENGTH,
  isValidMessageId,
} from '../utils/message';

/** Reject invalid client turn identities before chat admission or resume lookups. */
export function validateChatMessageIds(req: Request, res: Response, next: NextFunction): void {
  for (const field of ['messageId', 'responseMessageId'] as const) {
    const value: unknown = req.body?.[field];
    const maxLength =
      field === 'responseMessageId' ? MAX_RESPONSE_MESSAGE_ID_LENGTH : MAX_MESSAGE_ID_LENGTH;
    if (value != null && !isValidMessageId(value, maxLength)) {
      res.status(400).json({
        code: 'INVALID_MESSAGE_ID',
        error: `${field} must be a 1-${maxLength} character identifier using letters, digits, _, :, ., or -.`,
      });
      return;
    }
  }
  next();
}
