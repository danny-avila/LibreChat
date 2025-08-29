/**
 * Security utilities for enhanced content rendering
 * Provides URL validation, input sanitization, and XSS prevention
 */

// Allowed protocols for multimedia URLs
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

// Allowed domains for multimedia content (can be configured)
const ALLOWED_DOMAINS = [
  // Common image/video hosting services
  'imgur.com',
  'i.imgur.com',
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'soundcloud.com',
  'spotify.com',
  // Add more as needed
];

// File extensions for different media types
const MEDIA_EXTENSIONS = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
  video: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
};

export interface URLValidationResult {
  isValid: boolean;
  sanitizedUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  error?: string;
}

/**
 * Validates and sanitizes URLs for multimedia content
 */
export function validateAndSanitizeURL(url: string): URLValidationResult {
  try {
    // Basic URL format validation
    const urlObj = new URL(url);
    
    // Check protocol
    if (!ALLOWED_PROTOCOLS.includes(urlObj.protocol)) {
      return {
        isValid: false,
        error: `Protocol ${urlObj.protocol} is not allowed. Only HTTP and HTTPS are supported.`,
      };
    }

    // Prevent data URLs and javascript URLs
    if (urlObj.protocol === 'data:' || urlObj.protocol === 'javascript:') {
      return {
        isValid: false,
        error: 'Data URLs and JavaScript URLs are not allowed for security reasons.',
      };
    }

    // Check if domain is in allowed list (if configured)
    if (ALLOWED_DOMAINS.length > 0) {
      const hostname = urlObj.hostname.toLowerCase();
      const isAllowed = ALLOWED_DOMAINS.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
      
      if (!isAllowed) {
        return {
          isValid: false,
          error: `Domain ${hostname} is not in the allowed domains list.`,
        };
      }
    }

    // Determine media type from file extension
    const pathname = urlObj.pathname.toLowerCase();
    let mediaType: 'image' | 'video' | 'audio' | undefined;

    for (const [type, extensions] of Object.entries(MEDIA_EXTENSIONS)) {
      if (extensions.some(ext => pathname.endsWith('.' + ext))) {
        mediaType = type as 'image' | 'video' | 'audio';
        break;
      }
    }

    // Remove potentially dangerous query parameters
    const dangerousParams = ['callback', 'jsonp', 'onload', 'onerror'];
    dangerousParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });

    return {
      isValid: true,
      sanitizedUrl: urlObj.toString(),
      mediaType,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Sanitizes HTML content to prevent XSS attacks
 */
export function sanitizeHTML(html: string): string {
  // Create a temporary DOM element
  const temp = document.createElement('div');
  temp.textContent = html;
  return temp.innerHTML;
}

/**
 * Sanitizes widget code by removing dangerous functions and patterns
 */
export function sanitizeWidgetCode(code: string, type: 'react' | 'html'): string {
  let sanitized = code;

  if (type === 'react') {
    // Remove dangerous React patterns
    const dangerousPatterns = [
      /dangerouslySetInnerHTML/gi,
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
      /document\./gi,
      /window\./gi,
      /global\./gi,
      /process\./gi,
      /require\s*\(/gi,
      /import\s+.*\s+from/gi,
    ];

    dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '/* REMOVED FOR SECURITY */');
    });
  } else if (type === 'html') {
    // Remove dangerous HTML patterns
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^>]*>/gi,
      /<object\b[^>]*>/gi,
      /<embed\b[^>]*>/gi,
      /<form\b[^>]*>/gi,
      /on\w+\s*=/gi, // Remove event handlers
      /javascript:/gi,
      /data:/gi,
    ];

    dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '<!-- REMOVED FOR SECURITY -->');
    });
  }

  return sanitized;
}

/**
 * Validates and sanitizes chart data
 */
export function sanitizeChartData(data: string): { isValid: boolean; sanitizedData?: string; error?: string } {
  try {
    // If it's a URL, validate it
    if (data.startsWith('http://') || data.startsWith('https://')) {
      const urlValidation = validateAndSanitizeURL(data);
      if (!urlValidation.isValid) {
        return { isValid: false, error: urlValidation.error };
      }
      return { isValid: true, sanitizedData: urlValidation.sanitizedUrl };
    }

    // If it's JSON, validate and sanitize
    if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
      const parsed = JSON.parse(data);
      
      // Remove any function properties or dangerous content
      const sanitized = JSON.parse(JSON.stringify(parsed, (key, value) => {
        if (typeof value === 'function' || typeof value === 'undefined') {
          return null;
        }
        if (typeof value === 'string') {
          // Remove potential XSS in string values
          return sanitizeHTML(value);
        }
        return value;
      }));

      return { isValid: true, sanitizedData: JSON.stringify(sanitized) };
    }

    // If it's CSV, basic sanitization
    const lines = data.split('\n');
    const sanitizedLines = lines.map(line => {
      // Remove potential script injections in CSV
      return line.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    });

    return { isValid: true, sanitizedData: sanitizedLines.join('\n') };
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid data format: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Content Security Policy configuration for Sandpack
 */
export const CSP_CONFIG = {
  'script-src': [
    "'self'",
    "'unsafe-eval'", // Required for Sandpack
    'https://sandpack-bundler.vercel.app',
    'https://codesandbox.io',
  ].join(' '),
  'frame-src': [
    "'self'",
    'https://sandpack-bundler.vercel.app',
    'https://codesandbox.io',
  ].join(' '),
  'connect-src': [
    "'self'",
    'https://sandpack-bundler.vercel.app',
    'https://codesandbox.io',
    'https://unpkg.com',
  ].join(' '),
  'img-src': [
    "'self'",
    'data:',
    'https:',
  ].join(' '),
  'media-src': [
    "'self'",
    'https:',
  ].join(' '),
};

/**
 * Generates CSP header string
 */
export function generateCSPHeader(): string {
  return Object.entries(CSP_CONFIG)
    .map(([directive, value]) => `${directive} ${value}`)
    .join('; ');
}

/**
 * XSS prevention utilities
 */
export const XSSPrevention = {
  /**
   * Escapes HTML entities
   */
  escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Removes script tags and event handlers
   */
  removeScripts(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  },

  /**
   * Validates that content doesn't contain dangerous patterns
   */
  validateContent(content: string): { isValid: boolean; error?: string } {
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /Function\s*\(/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        return {
          isValid: false,
          error: `Content contains potentially dangerous pattern: ${pattern.source}`,
        };
      }
    }

    return { isValid: true };
  },
};