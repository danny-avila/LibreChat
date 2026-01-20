# LibreChat-3T Nexus Deployment Guide

## Overview

This guide explains how to build and push the LibreChat-3T Docker image to a Nexus Docker registry.

## Prerequisites

- Docker installed and running
- Access to a Nexus Docker registry
- Valid Nexus credentials

## Quick Start

Use the provided deployment script:

```bash
./deploy-to-nexus.sh <NEXUS_URL> [IMAGE_TAG]
```

### Examples

```bash
# Push with default tag (latest)
./deploy-to-nexus.sh nexus.example.com:8082

# Push with specific version tag
./deploy-to-nexus.sh nexus.example.com:8082 v0.8.2-rc1

# Push to a different registry path
./deploy-to-nexus.sh nexus.example.com:8082/repository/docker-hosted v1.0.0
```

## Manual Deployment Steps

### 1. Build the Docker Image

```bash
# Ensure package-lock.json is in sync
npm install

# Build the image
docker build -t librechat-3t:latest .
```

### 2. Login to Nexus

```bash
docker login <NEXUS_URL>
```

You will be prompted for your Nexus username and password.

### 3. Tag the Image

```bash
# Tag with latest
docker tag librechat-3t:latest <NEXUS_URL>/librechat-3t:latest

# Tag with version (recommended)
docker tag librechat-3t:latest <NEXUS_URL>/librechat-3t:v0.8.2-rc1
```

### 4. Push to Nexus

```bash
docker push <NEXUS_URL>/librechat-3t:latest
docker push <NEXUS_URL>/librechat-3t:v0.8.2-rc1
```

## Pulling the Image

To pull the image from Nexus on another machine:

```bash
docker login <NEXUS_URL>
docker pull <NEXUS_URL>/librechat-3t:latest
```

## Using with Docker Compose

Update your `docker-compose.yml` to use the Nexus image:

```yaml
services:
  api:
    image: <NEXUS_URL>/librechat-3t:latest
    # ... rest of configuration
```

## Troubleshooting

### Package Lock Sync Error

If you see "package.json and package-lock.json are in sync" error during build:

```bash
npm install
```

### Authentication Failed

Ensure your Nexus credentials are correct and you have push permissions to the repository.

### Image Not Found After Push

Verify the repository exists in Nexus and is configured as a Docker hosted repository.

## Image Details

- **Base Image**: node:20-alpine
- **Size**: ~1.8GB
- **Exposed Port**: 3080
- **Default Command**: `npm run backend`
