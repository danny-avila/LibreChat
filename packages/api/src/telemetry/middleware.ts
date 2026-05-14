import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span, Attributes } from '@opentelemetry/api';
import type { NextFunction, Response } from 'express';
import type { ServerRequest } from '~/types';
import { getTelemetryRequestSpan } from './sdk';

const CLIENT_CLOSED_REQUEST_STATUS_CODE = 499;

function getUserId(req: ServerRequest): string | undefined {
  return req.user?.id;
}

function getTenantId(req: ServerRequest): string | undefined {
  return req.user?.tenantId;
}

function isHealthPath(req: ServerRequest): boolean {
  return req.path === '/health';
}

function isApiPath(req: ServerRequest): boolean {
  return req.path === '/api' || req.path.startsWith('/api/');
}

function getRoutePath(req: ServerRequest): string {
  const routePath = req.route?.path;
  if (typeof routePath === 'string') {
    return `${req.baseUrl}${routePath}`;
  }

  if (isHealthPath(req)) {
    return '/health';
  }

  if (isApiPath(req)) {
    return '/api/*';
  }

  return 'spa_fallback';
}

function getElapsedMilliseconds(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function setIdentityAttributes(span: Span, req: ServerRequest): void {
  const userId = getUserId(req);
  const tenantId = getTenantId(req);
  const attributes: Attributes = {};

  if (userId) {
    attributes['enduser.id'] = userId;
  }

  if (tenantId) {
    attributes['librechat.tenant.id'] = tenantId;
  }

  if (Object.keys(attributes).length > 0) {
    span.setAttributes(attributes);
  }
}

function setCompletionAttributes(
  span: Span,
  req: ServerRequest,
  res: Response,
  start: bigint,
  aborted = false,
): void {
  const statusCode = aborted ? CLIENT_CLOSED_REQUEST_STATUS_CODE : res.statusCode;
  const routePath = getRoutePath(req);
  const attributes: Attributes = {
    'http.route': routePath,
    'http.response.status_code': statusCode,
    'librechat.request.duration_ms': getElapsedMilliseconds(start),
    'url.path': routePath,
  };

  if (aborted) {
    attributes['librechat.request.aborted'] = true;
  }

  setIdentityAttributes(span, req);
  span.setAttributes(attributes);

  if (aborted || statusCode >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

export function telemetryMiddleware(req: ServerRequest, res: Response, next: NextFunction): void {
  if (isHealthPath(req)) {
    next();
    return;
  }

  const span = getTelemetryRequestSpan(req) ?? trace.getActiveSpan();
  if (!span) {
    next();
    return;
  }

  const start = process.hrtime.bigint();
  span.setAttributes({
    'http.request.method': req.method,
  });

  let completed = false;
  const complete = () => {
    if (completed) {
      return;
    }
    completed = true;
    setCompletionAttributes(span, req, res, start);
  };

  const close = () => {
    if (completed) {
      return;
    }
    completed = true;
    setCompletionAttributes(span, req, res, start, !res.writableEnded);
  };

  res.once('finish', complete);
  res.once('close', close);
  next();
}

export function telemetryErrorMiddleware(
  err: Error,
  req: ServerRequest,
  _res: Response,
  next: NextFunction,
): void {
  const span = getTelemetryRequestSpan(req) ?? trace.getActiveSpan();
  if (span) {
    const routePath = getRoutePath(req);
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR });
    setIdentityAttributes(span, req);
    span.setAttributes({
      'error.type': err.name || err.constructor.name,
      'http.route': routePath,
      'url.path': routePath,
    });
  }

  next(err);
}
