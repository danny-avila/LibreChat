import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';
import { logger } from '@librechat/data-schemas';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

const PATH_NORMALIZATIONS: [RegExp, string][] = [
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
  const normalized = PATH_NORMALIZATIONS.reduce(
    (p, [pattern, replacement]) => p.replace(pattern, replacement),
    path || '/',
  );

  if (normalized !== path) {
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
