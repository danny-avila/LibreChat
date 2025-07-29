const jwt = require('jsonwebtoken');
const { logger } = require('~/config');

/**
 * Middleware to handle iframe authentication via query parameters
 * Checks for a valid token in query parameters and sets appropriate headers
 * for iframe embedding based on configuration
 */
const iframeAuth = async (req, res, next) => {
  try {
    // Get security config from app locals (loaded from librechat.yaml)
    const securityConfig = req.app.locals.securityConfig || {};
    const { allowIframe = false, frameAncestors = ["'self'"], allowTokenAuth = false } = securityConfig;

    // Set iframe security headers
    if (allowIframe) {
      // Allow iframe embedding by setting appropriate CSP headers
      // Convert 'self' to self (remove quotes if present)
      const processedAncestors = frameAncestors.map(ancestor => 
        ancestor === 'self' || ancestor === "'self'" ? "'self'" : ancestor
      );
      // Add file: and data: origins for testing, plus *.div25.com for production
      const frameAncestorsDirective = `${processedAncestors.join(' ')} file: data: https://*.div25.com`;
      res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestorsDirective}`);
      
      // Remove X-Frame-Options header when iframe is allowed
      res.removeHeader('X-Frame-Options');
      
      // Set additional headers for iframe compatibility
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      
      logger.debug('[iframeAuth] Iframe embedding allowed, CSP:', `frame-ancestors ${frameAncestorsDirective}`);
    } else {
      // Prevent iframe embedding
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
      logger.debug('[iframeAuth] Iframe embedding denied');
    }

    // Handle token-based authentication if enabled
    if (allowTokenAuth && req.query.token) {
      try {
        const token = req.query.token;
        
        // First, try to verify if it's a LibreChat JWT token
        let isLibreChatToken = false;
        let decoded = null;
        
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET);
          isLibreChatToken = true;
          logger.debug('[iframeAuth] LibreChat JWT token verified for user:', decoded.id);
        } catch (jwtError) {
          // Not a LibreChat JWT, treat as custom backend token
          logger.debug('[iframeAuth] Not a LibreChat JWT, treating as custom backend token');
        }
        
        if (isLibreChatToken && decoded && decoded.id) {
          // Handle LibreChat JWT token
          const expiryTime = 24 * 60 * 60 * 1000; // 24 hours
          const isProduction = process.env.NODE_ENV === 'production';
          
          res.cookie('token', token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: allowIframe ? 'none' : 'strict',
            maxAge: expiryTime
          });
          
          logger.debug('[iframeAuth] LibreChat token authentication successful for user:', decoded.id);
        } else {
          // Handle custom backend token - validate with your backend
          logger.debug('[iframeAuth] Processing custom backend token');
          
          // Set the custom backend token as a cookie so the customBackendTokenAuth middleware can use it
          // This bridges the gap between URL parameter and cookie-based authentication
          res.cookie('custom_backend_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: allowIframe ? 'none' : 'strict',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/'
          });
          
          logger.debug('[iframeAuth] Custom backend token stored in cookie for authentication middleware');
        }
        
      } catch (tokenError) {
        logger.warn('[iframeAuth] Token processing error:', tokenError.message);
      }
    }

    next();
  } catch (error) {
    logger.error('[iframeAuth] Error in iframe auth middleware:', error);
    next();
  }
};

module.exports = iframeAuth;
