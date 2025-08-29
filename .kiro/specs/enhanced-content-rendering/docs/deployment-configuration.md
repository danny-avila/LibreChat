# Deployment and Configuration Guide

## Overview

This guide covers the deployment and configuration of the Enhanced Content Rendering system in LibreChat. The system is designed to integrate seamlessly with existing LibreChat installations while providing additional rich content capabilities.

## Prerequisites

### System Requirements
- **Node.js**: Version 18.x or higher
- **LibreChat**: Version 0.7.0 or higher
- **Browser Support**: Modern browsers with ES2020 support
- **Memory**: Additional 512MB RAM recommended for enhanced features
- **Storage**: Additional 100MB for dependencies and cache

### Required Dependencies
```json
{
  "dependencies": {
    "chart.js": "^4.4.0",
    "react-chartjs-2": "^5.2.0"
  },
  "devDependencies": {
    "@types/chart.js": "^2.9.41"
  }
}
```

**Note**: `@codesandbox/sandpack-react` is already included in LibreChat for the artifacts system.
```

## Installation Steps

### 1. Install Dependencies

#### Using npm (recommended)
```bash
# Navigate to client directory
cd client

# Install enhanced content dependencies
npm install chart.js react-chartjs-2

# Install type definitions
npm install --save-dev @types/chart.js

# Note: Sandpack is already available in LibreChat
```

#### Using yarn
```bash
cd client
yarn add chart.js react-chartjs-2 @sandpack/react @sandpack/client
yarn add --dev @types/chart.js
```

### 2. Copy Enhanced Content Files

The enhanced content system files should be placed in the following structure:
```
client/src/components/Chat/Messages/Content/enhanced/
├── types.ts
├── ContentParser.ts
├── EnhancedMessageContent.tsx
├── ContentBlockRenderer.tsx
├── MultimediaRenderer.tsx
├── TTSRenderer.tsx
├── TTSEngine.ts
├── ChartRenderer.tsx
├── ChartDataParser.ts
├── WidgetRenderer.tsx
├── CodeExecutionRenderer.tsx
├── EnhancedContentErrorBoundary.tsx
├── enhanced-content.css
├── components/
│   ├── PlaceholderComponents.tsx
│   └── CompatibilityWarning.tsx
└── utils/
    ├── index.ts
    ├── SecurityUtils.ts
    ├── BrowserCompatibility.ts
    ├── AccessibilityUtils.ts
    ├── LazyLoader.ts
    ├── LRUCache.ts
    ├── MemoryManager.ts
    ├── PerformanceMonitor.ts
    ├── CacheManager.ts
    └── MessageIntegration.ts
```

### 3. Update LibreChat Configuration

#### Modify MessageContent.tsx
```typescript
// client/src/components/Chat/Messages/Content/MessageContent.tsx
import { EnhancedMessageContent } from './enhanced/EnhancedMessageContent';

const MessageContent = ({ message, isLatestMessage, ...props }) => {
  // Check if message is from assistant and has enhanced content
  const isAssistantMessage = message.isCreatedByUser === false;
  const hasEnhancedContent = isAssistantMessage && 
    message.text && 
    (message.text.includes('[tts:') || 
     message.text.includes('[chart:') || 
     message.text.includes('[widget:') || 
     message.text.includes('[run:') ||
     /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|wav|ogg)/i.test(message.text));

  if (hasEnhancedContent) {
    return (
      <EnhancedMessageContent 
        message={message} 
        isLatestMessage={isLatestMessage}
        {...props}
      />
    );
  }

  // Existing MessageContent logic
  return (
    <div className="markdown prose dark:prose-invert">
      {/* Existing content rendering */}
    </div>
  );
};
```

### 4. Update CSS Imports

#### Add to main CSS file
```css
/* client/src/style.css or appropriate CSS file */
@import './components/Chat/Messages/Content/enhanced/enhanced-content.css';
```

### 5. Configure Content Security Policy

#### Update CSP headers
```javascript
// api/server/middleware/setHeaders.js or equivalent
const cspDirectives = {
  'default-src': "'self'",
  'script-src': "'self' 'unsafe-eval' https://sandpack-bundler.vercel.app",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: https:",
  'media-src': "'self' https:",
  'connect-src': "'self' https://sandpack-bundler.vercel.app",
  'frame-src': "'self' https://sandpack-bundler.vercel.app",
  'worker-src': "'self' blob:"
};
```

## Configuration Options

### 1. Environment Variables

#### Enhanced Content Configuration
```bash
# .env file additions

# Enable/disable enhanced content features
ENHANCED_CONTENT_ENABLED=true

# TTS Configuration
TTS_ENABLED=true
TTS_MAX_LENGTH=500
TTS_DEFAULT_LANGUAGE=en-US

# Chart Configuration
CHARTS_ENABLED=true
CHARTS_MAX_DATA_POINTS=1000
CHARTS_ALLOW_EXTERNAL_DATA=true

# Widget Configuration
WIDGETS_ENABLED=true
WIDGETS_TIMEOUT=5000
WIDGETS_MAX_MEMORY=50

# Code Execution Configuration
CODE_EXECUTION_ENABLED=true
CODE_EXECUTION_TIMEOUT=10000

# Performance Configuration
ENHANCED_CONTENT_CACHE_SIZE=100
ENHANCED_CONTENT_LAZY_LOADING=true

# Security Configuration
ENHANCED_CONTENT_STRICT_CSP=true
ENHANCED_CONTENT_ALLOWED_DOMAINS=cdn.example.com,assets.example.com
```

### 2. Runtime Configuration

#### Create configuration file
```typescript
// client/src/config/enhancedContent.ts
export const enhancedContentConfig = {
  // Feature toggles
  features: {
    multimedia: process.env.REACT_APP_MULTIMEDIA_ENABLED !== 'false',
    tts: process.env.REACT_APP_TTS_ENABLED !== 'false',
    charts: process.env.REACT_APP_CHARTS_ENABLED !== 'false',
    widgets: process.env.REACT_APP_WIDGETS_ENABLED !== 'false',
    codeExecution: process.env.REACT_APP_CODE_EXECUTION_ENABLED !== 'false'
  },

  // Performance settings
  performance: {
    cacheSize: parseInt(process.env.REACT_APP_CACHE_SIZE || '100'),
    lazyLoading: process.env.REACT_APP_LAZY_LOADING !== 'false',
    maxConcurrentLoads: parseInt(process.env.REACT_APP_MAX_CONCURRENT_LOADS || '3')
  },

  // Security settings
  security: {
    strictCSP: process.env.REACT_APP_STRICT_CSP !== 'false',
    allowedDomains: (process.env.REACT_APP_ALLOWED_DOMAINS || '').split(',').filter(Boolean),
    maxExecutionTime: parseInt(process.env.REACT_APP_MAX_EXECUTION_TIME || '10000')
  },

  // TTS settings
  tts: {
    maxLength: parseInt(process.env.REACT_APP_TTS_MAX_LENGTH || '500'),
    defaultLanguage: process.env.REACT_APP_TTS_DEFAULT_LANGUAGE || 'en-US',
    supportedLanguages: [
      'en-US', 'en-GB', 'es-ES', 'es-MX', 'fr-FR', 'de-DE',
      'it-IT', 'pt-PT', 'pt-BR', 'pl-PL', 'ja-JP', 'ko-KR', 'zh-CN'
    ]
  },

  // Chart settings
  charts: {
    maxDataPoints: parseInt(process.env.REACT_APP_CHARTS_MAX_DATA_POINTS || '1000'),
    allowExternalData: process.env.REACT_APP_CHARTS_ALLOW_EXTERNAL_DATA !== 'false',
    defaultColors: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
  },

  // Widget settings
  widgets: {
    timeout: parseInt(process.env.REACT_APP_WIDGETS_TIMEOUT || '5000'),
    maxMemory: parseInt(process.env.REACT_APP_WIDGETS_MAX_MEMORY || '50'),
    allowedPackages: ['react', 'react-dom']
  }
};
```

## Docker Deployment

### 1. Dockerfile Updates

#### Add to existing Dockerfile
```dockerfile
# Add enhanced content dependencies
FROM node:18-alpine AS enhanced-deps
WORKDIR /app
COPY client/package*.json ./
RUN npm ci --only=production

# Copy enhanced content files
COPY client/src/components/Chat/Messages/Content/enhanced ./src/components/Chat/Messages/Content/enhanced

# Build with enhanced content
FROM node:18-alpine AS build
WORKDIR /app
COPY --from=enhanced-deps /app/node_modules ./node_modules
COPY client/ ./
RUN npm run build
```

### 2. Docker Compose Configuration

#### Update docker-compose.yml
```yaml
version: '3.8'

services:
  librechat:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      # Enhanced content configuration
      - ENHANCED_CONTENT_ENABLED=true
      - TTS_ENABLED=true
      - CHARTS_ENABLED=true
      - WIDGETS_ENABLED=true
      - CODE_EXECUTION_ENABLED=true
      
      # Security configuration
      - ENHANCED_CONTENT_STRICT_CSP=true
      - ENHANCED_CONTENT_ALLOWED_DOMAINS=cdn.example.com
      
      # Performance configuration
      - ENHANCED_CONTENT_CACHE_SIZE=100
      - ENHANCED_CONTENT_LAZY_LOADING=true
    
    # Additional memory for enhanced features
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
```

## Kubernetes Deployment

### 1. ConfigMap for Enhanced Content
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: enhanced-content-config
data:
  ENHANCED_CONTENT_ENABLED: "true"
  TTS_ENABLED: "true"
  CHARTS_ENABLED: "true"
  WIDGETS_ENABLED: "true"
  CODE_EXECUTION_ENABLED: "true"
  ENHANCED_CONTENT_CACHE_SIZE: "100"
  ENHANCED_CONTENT_STRICT_CSP: "true"
```

### 2. Deployment Configuration
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: librechat-enhanced
spec:
  replicas: 3
  selector:
    matchLabels:
      app: librechat-enhanced
  template:
    metadata:
      labels:
        app: librechat-enhanced
    spec:
      containers:
      - name: librechat
        image: librechat:enhanced-latest
        envFrom:
        - configMapRef:
            name: enhanced-content-config
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        ports:
        - containerPort: 3080
```

## Nginx Configuration

### 1. Reverse Proxy Setup
```nginx
# /etc/nginx/sites-available/librechat-enhanced
server {
    listen 80;
    server_name your-domain.com;
    
    # Enhanced content specific headers
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' https://sandpack-bundler.vercel.app; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self' https://sandpack-bundler.vercel.app; frame-src 'self' https://sandpack-bundler.vercel.app; worker-src 'self' blob:;" always;
    
    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Compression for enhanced content assets
    gzip on;
    gzip_types
        text/css
        text/javascript
        application/javascript
        application/json
        image/svg+xml;
    
    location / {
        proxy_pass http://localhost:3080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increased timeouts for code execution
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 2. SSL Configuration
```nginx
# SSL configuration for enhanced content
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    # SSL security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;
    
    # Rest of configuration same as HTTP version
    # ...
}
```

## Monitoring and Logging

### 1. Performance Monitoring
```javascript
// client/src/utils/monitoring.ts
export class EnhancedContentMonitoring {
  static setupMonitoring() {
    // Performance monitoring
    if (typeof window !== 'undefined' && window.performance) {
      this.monitorPerformance();
    }
    
    // Error monitoring
    window.addEventListener('error', this.handleError);
    window.addEventListener('unhandledrejection', this.handlePromiseRejection);
  }
  
  static monitorPerformance() {
    // Monitor enhanced content load times
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name.includes('enhanced-content')) {
          console.log(`Enhanced content load: ${entry.name} - ${entry.duration}ms`);
        }
      }
    });
    
    observer.observe({ entryTypes: ['measure', 'navigation'] });
  }
  
  static handleError(event) {
    if (event.filename?.includes('enhanced')) {
      console.error('Enhanced content error:', event.error);
      // Send to monitoring service
    }
  }
}
```

### 2. Logging Configuration
```javascript
// api/config/winston.js - Add enhanced content logging
const winston = require('winston');

const enhancedContentLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'enhanced-content' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/enhanced-content-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/enhanced-content.log' 
    })
  ]
});

module.exports = { enhancedContentLogger };
```

## Health Checks

### 1. Application Health Check
```javascript
// api/server/routes/health.js
const express = require('express');
const router = express.Router();

router.get('/enhanced-content', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      features: {
        tts: process.env.TTS_ENABLED === 'true',
        charts: process.env.CHARTS_ENABLED === 'true',
        widgets: process.env.WIDGETS_ENABLED === 'true',
        codeExecution: process.env.CODE_EXECUTION_ENABLED === 'true'
      },
      dependencies: {
        sandpack: await checkSandpackHealth(),
        chartjs: await checkChartJSHealth()
      }
    };
    
    res.json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

async function checkSandpackHealth() {
  // Check if Sandpack bundler is accessible
  try {
    const response = await fetch('https://sandpack-bundler.vercel.app/health');
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = router;
```

### 2. Kubernetes Health Probes
```yaml
# Health check configuration
livenessProbe:
  httpGet:
    path: /health/enhanced-content
    port: 3080
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/enhanced-content
    port: 3080
  initialDelaySeconds: 5
  periodSeconds: 5
```

## Troubleshooting Deployment Issues

### 1. Common Deployment Problems

#### Dependency Issues
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for peer dependency issues
npm ls
```

#### Build Issues
```bash
# Check TypeScript compilation
npx tsc --noEmit

# Check for missing dependencies
npm audit
npm audit fix

# Verbose build output
npm run build -- --verbose
```

#### Runtime Issues
```bash
# Check browser console for errors
# Verify CSP headers are correct
# Check network tab for failed resource loads
# Verify environment variables are set
```

### 2. Performance Issues

#### Memory Issues
```bash
# Monitor memory usage
node --max-old-space-size=4096 server.js

# Enable garbage collection logging
node --trace-gc server.js
```

#### Load Time Issues
```bash
# Analyze bundle size
npm run build -- --analyze

# Check for unused dependencies
npx depcheck

# Optimize images and assets
npx imagemin-cli images/* --out-dir=optimized
```

## Backup and Recovery

### 1. Configuration Backup
```bash
#!/bin/bash
# backup-enhanced-content.sh

# Backup configuration files
tar -czf enhanced-content-config-$(date +%Y%m%d).tar.gz \
  .env \
  client/src/config/enhancedContent.ts \
  nginx.conf \
  docker-compose.yml

# Backup enhanced content files
tar -czf enhanced-content-files-$(date +%Y%m%d).tar.gz \
  client/src/components/Chat/Messages/Content/enhanced/
```

### 2. Recovery Procedures
```bash
#!/bin/bash
# restore-enhanced-content.sh

# Restore configuration
tar -xzf enhanced-content-config-*.tar.gz

# Restore enhanced content files
tar -xzf enhanced-content-files-*.tar.gz

# Reinstall dependencies
npm install

# Rebuild application
npm run build

# Restart services
docker-compose restart
```

## Scaling Considerations

### 1. Horizontal Scaling
- Use load balancers for multiple instances
- Implement session affinity if needed
- Share cache across instances using Redis
- Monitor resource usage per instance

### 2. Vertical Scaling
- Increase memory allocation for enhanced features
- Monitor CPU usage during code execution
- Optimize garbage collection settings
- Use performance profiling tools

## Security Hardening

### 1. Production Security Checklist
- [ ] Enable strict CSP headers
- [ ] Validate all environment variables
- [ ] Implement rate limiting
- [ ] Enable HTTPS only
- [ ] Regular security audits
- [ ] Monitor for suspicious activity
- [ ] Keep dependencies updated
- [ ] Implement proper logging

### 2. Security Monitoring
```javascript
// Security event monitoring
const securityEvents = [
  'blocked_url',
  'widget_timeout',
  'execution_error',
  'memory_limit_exceeded',
  'csp_violation'
];

securityEvents.forEach(event => {
  window.addEventListener(event, (e) => {
    console.warn('Security event:', event, e.detail);
    // Send to security monitoring service
  });
});
```

This comprehensive deployment guide should help you successfully deploy and configure the Enhanced Content Rendering system in your LibreChat installation.