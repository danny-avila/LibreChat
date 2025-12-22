# LibreChat DevContainer Dockerfile
FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    py3-pip \
    make \
    g++ \
    jemalloc \
    bash \
    curl \
    openssh-client \
    sudo

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Create app directory
WORKDIR /workspaces

# Set npm configuration for better reliability
RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 15000

# Create vscode user with sudo privileges
RUN addgroup -g 1000 vscode && \
    adduser -u 1000 -G vscode -s /bin/bash -D vscode && \
    echo "vscode ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    chown -R vscode:vscode /workspaces

# Switch to vscode user
USER vscode

# Default command keeps container running
CMD ["/bin/sh", "-c", "while sleep 1000; do :; done"]
FROM node:18-bullseye

RUN useradd -m -s /bin/bash vscode
RUN mkdir -p /workspaces && chown -R vscode:vscode /workspaces
WORKDIR /workspaces
