import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';
import { logger } from '@librechat/data-schemas';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

const PATH_NORMALIZATIONS: [RegExp, string][] = [
  [/^\/api\/messages\/artifact\/[^/]+(?=\/|$)/, '/api/messages/artifact/#id'],
  [/^\/api\/messages\/[^/]+\/[^/]+(?=\/|$)/, '/api/messages/#id/#id'],
  [/^\/api\/convos\/[^/]+\/messages\/[^/]+(?=\/|$)/, '/api/convos/#id/messages/#id'],
  [/^\/api\/messages\/[^/]+(?=\/|$)/, '/api/messages/#id'],
  [/^\/api\/convos\/[^/]+(?=\/|$)/, '/api/convos/#id'],
  [/^\/api\/files\/[^/]+(?=\/|$)/, '/api/files/#id'],
  [/^\/api\/agents\/[^/]+(?=\/|$)/, '/api/agents/#id'],
  [/^\/api\/assistants\/[^/]+(?=\/|$)/, '/api/assistants/#id'],
  [/^\/api\/share\/[^/]+(?=\/|$)/, '/api/share/#token'],
  [/^\/share\/[^/]+(?=\/|$)/, '/share/#id'],
  [/^\/api\/(tags|tools|runs|sessions)\/[0-9a-f]{24}(?=\/|$)/i, '/api/$1/#id'],
  [
    /^\/api\/(tools|sessions)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/i,
    '/api/$1/#id',
  ],
];

const STATIC_PATHS = new Set(['/', '/health', '/metrics', '/api/auth/login', '/api/config']);

const LOW_CARDINALITY_PATHS: RegExp[] = [
  /^\/api\/messages\/#id$/,
  /^\/api\/messages\/#id\/#id$/,
  /^\/api\/messages\/artifact\/#id$/,
  /^\/api\/convos\/#id$/,
  /^\/api\/convos\/#id\/messages\/#id$/,
  /^\/api\/(files|agents|assistants|tags|tools|runs|sessions)\/#id$/,
  /^\/api\/share\/#token$/,
  /^\/share\/#id(?:\/edit)?$/,
];

const isLowCardinalityPath = (path: string): boolean =>
  STATIC_PATHS.has(path) || LOW_CARDINALITY_PATHS.some((pattern) => pattern.test(path));

const normalizeKnownPath = (path: string): string => {
  for (const [pattern, replacement] of PATH_NORMALIZATIONS) {
    if (pattern.test(path)) {
      return path.replace(pattern, replacement);
    }
  }

  return path;
};

const normalizeUnknownPath = (path: string): string => {
  if (STATIC_PATHS.has(path)) {
    return path;
  }

  if (path === '/api' || path.startsWith('/api/')) {
    return '/api/#path';
  }

  if (path === '/images' || path.startsWith('/images/')) {
    return '/images/#path';
  }

  if (path === '/avatars' || path.startsWith('/avatars/')) {
    return '/avatars/#path';
  }

  if (path === '/t' || path.startsWith('/t/')) {
    return '/t/#path';
  }

  return '/#path';
};

export const normalizePath = (rawPath: string): string => {
  const [pathWithoutQuery] = rawPath.split('?');
  const path = pathWithoutQuery.startsWith('/') ? pathWithoutQuery : `/${pathWithoutQuery}`;
  const normalized = normalizeKnownPath(path || '/');

  if (isLowCardinalityPath(normalized)) {
    return normalized;
  }

  return normalizeUnknownPath(path);
};

export interface PrometheusMetrics {
  metricsMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  metricsRouter: Router;
}

export function createMetrics(): PrometheusMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const httpRequests = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'path', 'status'] as const,
    registers: [registry],
  });

  const httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'path', 'status'] as const,
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [registry],
  });

  const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      const labels = { method: req.method, path: normalizePath(req.path), status: res.statusCode };
      httpRequests.inc(labels);
      end(labels);
    });
    next();
  };

  const metricsRouter = Router();
  const metricsHandler: RequestHandler = (req, res): void => {
    const secret = process.env.METRICS_SECRET;
    const auth = req.headers['authorization'];
    if (!secret || !auth) {
      res.status(401).end();
      return;
    }
    const bearerToken = auth.match(/^bearer\s+(.+)$/i);
    if (!bearerToken) {
      res.status(401).end();
      return;
    }

    const token = bearerToken[1];
    const encode = (s: string) => new TextEncoder().encode(s);
    const expected = encode(secret);
    const actual = encode(token);
    if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) {
      res.status(401).end();
      return;
    }

    void registry
      .metrics()
      .then((metrics) => {
        res.set('Content-Type', registry.contentType);
        res.end(metrics);
      })
      .catch((err) => {
        logger.error('[metrics] Failed to collect metrics:', err);
        res.status(500).end();
      });
  };

  metricsRouter.get('/', metricsHandler);

  return { metricsMiddleware, metricsRouter };
}
