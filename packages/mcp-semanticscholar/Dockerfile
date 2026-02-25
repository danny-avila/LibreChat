FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build the TypeScript code
RUN npm run build

# Expose port
EXPOSE 8081

# Start the server in HTTP mode
ENV TRANSPORT=http
CMD ["node", "build/index.js"]