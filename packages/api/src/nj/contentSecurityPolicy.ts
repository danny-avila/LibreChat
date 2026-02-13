import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';

/**
 * Content Security Policy middleware using helmet
 * Configures CSP to allow analytics and necessary external resources
 */
export const contentSecurityPolicy = () => {
  const parseEnvList = (envVar: string | undefined): string[] => {
    return envVar?.split(',').map(s => s.trim()).filter(s => s.length > 0) || [];
  };

  return helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://www.googletagmanager.com",
        "https://*.googletagmanager.com",
        ...parseEnvList(process.env.CSP_SCRIPT_SRC),
      ],
      scriptSrcElem: [
        "'self'",
        "'unsafe-inline'",
        "https://www.googletagmanager.com",
        "https://*.googletagmanager.com",
        ...parseEnvList(process.env.CSP_SCRIPT_SRC),
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: [
        "'self'", 
        'data:', 
        'https:', 
        'blob:',
      ],
      connectSrc: [
        "'self'",
        ...parseEnvList(process.env.CSP_CONNECT_SRC),
      ],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: [
        "'self'", 
        "https://innovation.nj.gov",
        "https://*.googletagmanager.com",
        "https://googletagmanager.com",
      ],
      childSrc: [
        "'self'",
        "https://*.googletagmanager.com",
        "https://googletagmanager.com",
      ],
      baseUri: ["'self'"],
      formAction: [
        "'self'",
        "https://www.googletagmanager.com",
        "https://*.googletagmanager.com",
      ],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
    reportOnly: false,
    useDefaults: false,
    },
  });
};

/**
 * Additional security headers middleware using helmet
 */
export const securityHeaders = () => {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: false,
    xssFilter: true,
  });
};

/**
 * Combined security middleware
 * Apply both CSP and other security headers
 */
export const applySecurityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSP for health check endpoint
  if (req.path === '/health') {
    return next();
  }

  // Apply security headers first
  securityHeaders()(req, res, (err) => {
    if (err) return next(err);
    
    // Then apply CSP
    contentSecurityPolicy()(req, res, next);
  });
};
