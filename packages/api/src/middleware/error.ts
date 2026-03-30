import { logger } from '@librechat/data-schemas';
import { ErrorTypes } from 'librechat-data-provider';
import type { NextFunction, Request, Response } from 'express';
import type { MongoServerError, ValidationError, CustomError } from '~/types';

const handleDuplicateKeyError = (err: MongoServerError, res: Response) => {
  logger.warn('Duplicate key error: ' + (err.errmsg || err.message));
  const field = err.keyValue ? `${JSON.stringify(Object.keys(err.keyValue))}` : 'unknown';
  const code = 409;
  res
    .status(code)
    .send({ messages: `An document with that ${field} already exists.`, fields: field });
};

const handleValidationError = (err: ValidationError, res: Response) => {
  logger.error('Validation error:', err.errors);
  const errorMessages = Object.values(err.errors).map((el) => el.message);
  const fields = `${JSON.stringify(Object.values(err.errors).map((el) => el.path))}`;
  const code = 400;
  const messages =
    errorMessages.length > 1
      ? `${JSON.stringify(errorMessages.join(' '))}`
      : `${JSON.stringify(errorMessages)}`;

  res.status(code).send({ messages, fields });
};

/** Type guard for ValidationError */
function isValidationError(err: unknown): err is ValidationError {
  return err !== null && typeof err === 'object' && 'name' in err && err.name === 'ValidationError';
}

/** Type guard for MongoServerError (duplicate key) */
function isMongoServerError(err: unknown): err is MongoServerError {
  return err !== null && typeof err === 'object' && 'code' in err && err.code === 11000;
}

/** Type guard for CustomError with statusCode and body */
function isCustomError(err: unknown): err is CustomError {
  return err !== null && typeof err === 'object' && 'statusCode' in err && 'body' in err;
}

export const ErrorController = (
  err: Error | CustomError,
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void => {
  try {
    if (!err) {
      return next();
    }
    const error = err as CustomError;

    if (
      (error.message === ErrorTypes.AUTH_FAILED || error.code === ErrorTypes.AUTH_FAILED) &&
      req.originalUrl &&
      req.originalUrl.includes('/oauth/') &&
      req.originalUrl.includes('/callback')
    ) {
      const domain = process.env.DOMAIN_CLIENT || 'http://localhost:3080';
      return res.redirect(`${domain}/login?redirect=false&error=${ErrorTypes.AUTH_FAILED}`);
    }

    if (isValidationError(error)) {
      return handleValidationError(error, res);
    }

    if (isMongoServerError(error)) {
      return handleDuplicateKeyError(error, res);
    }

    if (isCustomError(error) && error.statusCode && error.body) {
      return res.status(error.statusCode).send(error.body);
    }

    logger.error('ErrorController => error', err);
    return res.status(500).send('An unknown error occurred.');
  } catch (processingError) {
    logger.error('ErrorController => processing error', processingError);
    return res.status(500).send('Processing error in ErrorController.');
  }
};
