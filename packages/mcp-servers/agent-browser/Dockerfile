FROM node:22-slim AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ src/
RUN npm run build

FROM node:22-slim

# Install Chromium dependencies for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser
WORKDIR /app
COPY --from=builder /app/dist dist/
COPY --from=builder /app/node_modules node_modules/
COPY package.json ./

ENV CHROMIUM_PATH=/usr/bin/chromium
USER appuser
EXPOSE 8932

CMD ["node", "dist/server.js"]
