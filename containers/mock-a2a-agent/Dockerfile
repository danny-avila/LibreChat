# Mock A2A Agent Container
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies for better container security and debugging
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production && npm cache clean --force

# Copy application code
COPY server.js ./

# Create non-root user for security
RUN addgroup -g 1001 -S a2a && \
    adduser -S a2a -u 1001 -G a2a

# Change ownership of app directory
RUN chown -R a2a:a2a /app
USER a2a

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Labels for better container management
LABEL maintainer="LibreChat A2A Integration"
LABEL version="1.0.0"
LABEL description="Mock A2A Protocol Agent for LibreChat Integration"
LABEL a2a.protocol.version="0.1.0"
LABEL a2a.agent.type="mock"

# Start the server
CMD ["node", "server.js"]