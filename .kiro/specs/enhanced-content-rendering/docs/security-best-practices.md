# Security Considerations and Best Practices

## Overview

The Enhanced Content Rendering system is designed with security as a primary concern. Unlike systems that allow arbitrary HTML/JavaScript execution, this system uses controlled markup parsing and sandboxed execution environments to maintain security while enabling rich content.

## Security Architecture

### 1. Controlled Markup System
- **No arbitrary HTML/JavaScript**: Agents cannot inject raw HTML or JavaScript
- **Predefined markup tags**: Only specific, validated markup patterns are processed
- **Content sanitization**: All user-provided content is sanitized before rendering
- **Type validation**: Each content type has strict validation rules

### 2. Sandboxed Execution
- **Widget isolation**: Interactive widgets run in isolated Sandpack environments
- **Code execution**: Code runs through LibreChat's existing secure Code Interpreter
- **Resource limitations**: Execution time and memory limits prevent abuse
- **Network restrictions**: Limited or no network access from sandboxed code

### 3. Input Validation and Sanitization

#### URL Validation
```javascript
// Example validation patterns
const ALLOWED_PROTOCOLS = ['https:', 'http:'];
const BLOCKED_PROTOCOLS = ['javascript:', 'data:', 'file:', 'ftp:'];

function validateURL(url) {
  try {
    const parsed = new URL(url);
    
    // Check protocol
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    // Block dangerous protocols
    if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
      throw new Error('Blocked protocol');
    }
    
    return true;
  } catch (error) {
    return false;
  }
}
```

#### Content Sanitization
```javascript
// Sanitize text content
function sanitizeText(text) {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Sanitize JSON data
function sanitizeJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    // Validate structure and sanitize values
    return sanitizeObject(parsed);
  } catch (error) {
    throw new Error('Invalid JSON format');
  }
}
```

## Security Best Practices for Agents

### 1. URL Security

#### ✅ Safe Practices
```
Use HTTPS URLs when possible:
https://example.com/image.jpg

Use trusted domains:
https://cdn.example.com/media/video.mp4

Use direct file URLs:
https://storage.example.com/files/document.pdf
```

#### ❌ Unsafe Practices
```
Avoid HTTP for sensitive content:
http://unsecure.com/private-image.jpg

Don't use data URLs:
data:image/svg+xml;base64,PHN2Zy4uLg==

Never use javascript URLs:
javascript:alert('xss')

Avoid file:// URLs:
file:///etc/passwd
```

### 2. Widget Code Security

#### ✅ Safe Widget Practices
```javascript
// Safe React widget
[widget:react]
function SafeCalculator() {
  const [result, setResult] = React.useState(0);
  const [input, setInput] = React.useState('');
  
  const calculate = () => {
    // Safe calculation with validation
    try {
      const sanitized = input.replace(/[^0-9+\-*/().]/g, '');
      const result = Function('"use strict"; return (' + sanitized + ')')();
      setResult(result);
    } catch (e) {
      setResult('Error');
    }
  };
  
  return (
    <div>
      <input 
        value={input} 
        onChange={(e) => setInput(e.target.value)}
        maxLength={50}
      />
      <button onClick={calculate}>Calculate</button>
      <div>Result: {result}</div>
    </div>
  );
}
[/widget]
```

#### ❌ Unsafe Widget Practices
```javascript
// Dangerous practices to avoid
[widget:react]
function UnsafeWidget() {
  // Don't use eval() or Function() with user input
  const result = eval(userInput); // DANGEROUS
  
  // Don't access global objects
  window.location = 'http://malicious.com'; // BLOCKED
  
  // Don't try to break out of sandbox
  parent.postMessage('hack', '*'); // BLOCKED
  
  // Don't use innerHTML with user content
  div.innerHTML = userContent; // DANGEROUS
  
  return <div>Unsafe content</div>;
}
[/widget]
```

### 3. Data Security

#### Chart Data Validation
```javascript
// Safe chart data structure
{
  "labels": ["Q1", "Q2", "Q3", "Q4"],
  "datasets": [{
    "label": "Revenue",
    "data": [100, 150, 200, 180]
  }]
}

// Validate numeric data
function validateChartData(data) {
  if (!data.labels || !Array.isArray(data.labels)) {
    throw new Error('Invalid labels');
  }
  
  if (!data.datasets || !Array.isArray(data.datasets)) {
    throw new Error('Invalid datasets');
  }
  
  data.datasets.forEach(dataset => {
    if (!dataset.data || !Array.isArray(dataset.data)) {
      throw new Error('Invalid dataset data');
    }
    
    dataset.data.forEach(value => {
      if (typeof value !== 'number' || !isFinite(value)) {
        throw new Error('Invalid numeric value');
      }
    });
  });
  
  return true;
}
```

#### CSV Data Security
```
✅ Safe CSV format:
Name,Age,Department
John,25,Engineering
Sarah,30,Marketing

❌ Potentially dangerous CSV:
Name,Script,Department
John,<script>alert('xss')</script>,Engineering
Sarah,=cmd|'/c calc',Marketing
```

### 4. TTS Security

#### Language Code Validation
```javascript
// Whitelist of allowed language codes
const ALLOWED_LANGUAGES = [
  'en-US', 'en-GB', 'es-ES', 'es-MX', 'fr-FR', 'de-DE',
  'it-IT', 'pt-PT', 'pt-BR', 'pl-PL', 'ja-JP', 'ko-KR', 'zh-CN'
];

function validateLanguageCode(code) {
  return ALLOWED_LANGUAGES.includes(code);
}

// Safe TTS usage
[tts:en-US]Hello world[/tts]  // ✅ Safe
[tts:javascript:alert('xss')]text[/tts]  // ❌ Blocked
```

#### Text Content Limits
```javascript
// Limit TTS text length to prevent abuse
const MAX_TTS_LENGTH = 500;

function validateTTSText(text) {
  if (text.length > MAX_TTS_LENGTH) {
    throw new Error('TTS text too long');
  }
  
  // Remove potentially dangerous content
  const sanitized = text.replace(/<[^>]*>/g, '');
  return sanitized;
}
```

## Content Security Policy (CSP)

### Required CSP Directives
```http
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' 'unsafe-eval' https://sandpack-bundler.vercel.app;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  media-src 'self' https:;
  connect-src 'self' https://sandpack-bundler.vercel.app;
  frame-src 'self' https://sandpack-bundler.vercel.app;
  worker-src 'self' blob:;
```

### CSP Explanation
- **script-src**: Allows Sandpack for widget execution
- **unsafe-eval**: Required for Sandpack code compilation
- **img-src**: Allows HTTPS images and data URLs for charts
- **media-src**: Allows HTTPS audio/video content
- **frame-src**: Allows Sandpack iframe embedding

## Runtime Security Measures

### 1. Resource Limitations

#### Execution Timeouts
```javascript
// Widget execution timeout
const WIDGET_TIMEOUT = 5000; // 5 seconds

// Code execution timeout
const CODE_TIMEOUT = 10000; // 10 seconds

// TTS timeout
const TTS_TIMEOUT = 30000; // 30 seconds
```

#### Memory Limits
```javascript
// Monitor memory usage
function checkMemoryUsage() {
  if (performance.memory) {
    const used = performance.memory.usedJSHeapSize;
    const limit = performance.memory.jsHeapSizeLimit;
    
    if (used / limit > 0.9) {
      console.warn('High memory usage detected');
      // Cleanup old content
      cleanupOldContent();
    }
  }
}
```

### 2. Error Handling and Logging

#### Security Event Logging
```javascript
function logSecurityEvent(event, details) {
  console.warn('Security Event:', {
    type: event,
    timestamp: new Date().toISOString(),
    details: details,
    userAgent: navigator.userAgent
  });
  
  // Send to security monitoring if available
  if (window.securityMonitor) {
    window.securityMonitor.log(event, details);
  }
}

// Example usage
logSecurityEvent('BLOCKED_URL', {
  url: suspiciousUrl,
  reason: 'Invalid protocol'
});
```

#### Graceful Error Handling
```javascript
// Don't expose internal errors
function handleSecurityError(error) {
  // Log detailed error internally
  console.error('Internal security error:', error);
  
  // Show generic message to user
  return 'Content could not be displayed due to security restrictions.';
}
```

## Deployment Security

### 1. Environment Configuration

#### Production Settings
```javascript
// Disable debug features in production
const PRODUCTION_CONFIG = {
  enableDebugMode: false,
  allowUnsafeContent: false,
  strictCSP: true,
  enableSecurityHeaders: true,
  logSecurityEvents: true
};
```

#### Security Headers
```http
# Required security headers
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### 2. Regular Security Updates

#### Dependency Management
```bash
# Regular security audits
npm audit
npm audit fix

# Update dependencies
npm update

# Check for known vulnerabilities
npm audit --audit-level high
```

#### Security Monitoring
```javascript
// Monitor for suspicious patterns
function monitorSuspiciousActivity() {
  // Track failed content loads
  // Monitor execution timeouts
  // Log blocked content attempts
  // Alert on repeated security violations
}
```

## User Privacy Protection

### 1. Data Handling
- **No data collection**: Enhanced content doesn't collect user data
- **Local processing**: TTS and widgets run locally
- **No tracking**: No analytics or tracking in enhanced content
- **Temporary storage**: Cache is cleared regularly

### 2. External Resource Access
```javascript
// Validate external resources
function validateExternalResource(url) {
  // Check against privacy-friendly domains
  const privacyFriendlyDomains = [
    'cdn.example.com',
    'assets.example.com'
  ];
  
  const domain = new URL(url).hostname;
  return privacyFriendlyDomains.includes(domain);
}
```

## Security Testing

### 1. Automated Security Tests
```javascript
// Test XSS prevention
describe('XSS Prevention', () => {
  test('should sanitize malicious scripts', () => {
    const maliciousInput = '<script>alert("xss")</script>';
    const sanitized = sanitizeContent(maliciousInput);
    expect(sanitized).not.toContain('<script>');
  });
  
  test('should block dangerous URLs', () => {
    const dangerousUrl = 'javascript:alert("xss")';
    expect(validateURL(dangerousUrl)).toBe(false);
  });
});
```

### 2. Manual Security Testing
- Test with malicious URLs
- Attempt code injection in widgets
- Try to break sandbox isolation
- Test with oversized content
- Verify CSP enforcement

## Incident Response

### 1. Security Incident Handling
```javascript
// Security incident response
function handleSecurityIncident(incident) {
  // 1. Immediately block the threat
  blockContent(incident.contentId);
  
  // 2. Log the incident
  logSecurityEvent('SECURITY_INCIDENT', incident);
  
  // 3. Notify administrators
  notifyAdmins(incident);
  
  // 4. Clean up affected content
  cleanupAffectedContent(incident);
}
```

### 2. Recovery Procedures
- Disable affected content types temporarily
- Update security rules
- Patch vulnerabilities
- Communicate with users
- Monitor for similar incidents

## Compliance Considerations

### 1. GDPR Compliance
- No personal data collection
- Local processing only
- User consent for external resources
- Right to disable features

### 2. Accessibility Security
- Screen reader safe content
- No audio/visual attacks
- Keyboard navigation security
- Alternative content provision

## Best Practices Summary

### For Agents:
1. Use HTTPS URLs only
2. Validate all data inputs
3. Keep widgets simple and safe
4. Use trusted data sources
5. Test content before deployment
6. Follow markup syntax exactly
7. Provide fallback content
8. Respect user privacy

### For Developers:
1. Regular security audits
2. Keep dependencies updated
3. Monitor security logs
4. Test with malicious inputs
5. Implement proper CSP
6. Use security headers
7. Regular penetration testing
8. Document security procedures

### For Users:
1. Keep browsers updated
2. Use trusted LibreChat instances
3. Report suspicious content
4. Understand privacy implications
5. Use HTTPS connections
6. Enable security features
7. Regular security reviews
8. Follow organizational policies