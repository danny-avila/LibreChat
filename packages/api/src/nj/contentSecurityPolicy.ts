import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';

/**
 * Content Security Policy middleware using helmet
 * Configures CSP to allow analytics and necessary external resources
 */
export const contentSecurityPolicy = () => {
  return helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        ...(process.env.CSP_SCRIPT_SRC?.split(',').map(s => s.trim()) || []),
      ],
      scriptSrcElem: [
        "'self'",
        "'unsafe-inline'",
        ...(process.env.CSP_SCRIPT_SRC?.split(',').map(s => s.trim()) || []),
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: [
        "'self'",
        ...(process.env.CSP_CONNECT_SRC?.split(',').map(s => s.trim()) || []),
      ],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://innovation.nj.gov"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
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
