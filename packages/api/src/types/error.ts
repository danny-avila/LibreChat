import type { Error as MongooseError } from 'mongoose';

/** MongoDB duplicate key error interface */
export interface MongoServerError extends Error {
  code: number;
  keyValue?: Record<string, unknown>;
  errmsg?: string;
}

/** Mongoose validation error interface */
export interface ValidationError extends MongooseError {
  name: 'ValidationError';
  errors: Record<
    string,
    {
      message: string;
      path?: string;
    }
  >;
}

/** Custom error with status code and body */
export interface CustomError extends Error {
  statusCode?: number;
  body?: unknown;
  code?: string | number;
}
