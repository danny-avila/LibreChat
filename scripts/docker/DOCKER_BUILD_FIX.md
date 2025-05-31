# Docker Build Fix for Rollup on Alpine Linux

## Problem

The Docker build is failing with the following error:
```
Error: Cannot find module @rollup/rollup-linux-x64-musl
```

This occurs because:
1. The project uses Alpine Linux (`node:20-alpine`) as the base image
2. Alpine uses musl libc instead of glibc
3. Rollup v4.x has platform-specific optional dependencies
4. npm has a known bug with optional dependencies that prevents the musl-specific rollup binary from being installed correctly

## Solutions

I've created two fixed Dockerfile versions:

### 1. Single-stage Dockerfile (`Dockerfile.fixed`)

This is a fixed version of the original Dockerfile that:
- Cleans npm cache before installation
- Installs dependencies with `--ignore-scripts` first
- Manually installs the Alpine-specific rollup dependency: `@rollup/rollup-linux-x64-musl`
- Runs `npm rebuild` to ensure native modules are built correctly
- Then proceeds with the build process

### 2. Multi-stage Dockerfile (`Dockerfile.multi.fixed`)

This is a more efficient multi-stage build that:
- Separates the build process into multiple stages
- Installs the rollup platform dependency in the base stage
- Builds each package in isolation
- Creates a smaller final image with only production dependencies

## Usage

### Option 1: Use the fixed single-stage Dockerfile
```bash
docker build -f Dockerfile.fixed -t librechat:latest .
```

### Option 2: Use the fixed multi-stage Dockerfile (Recommended)
```bash
docker build -f Dockerfile.multi.fixed -t librechat:latest .
```

### Test the builds
```bash
chmod +x test-docker-build.sh
./test-docker-build.sh
```

## Key Changes Made

1. **Explicit installation of platform-specific dependency**:
   ```dockerfile
   npm install @rollup/rollup-linux-x64-musl --save-optional
   ```

2. **Clean npm cache before installation**:
   ```dockerfile
   npm cache clean --force
   ```

3. **Install with --ignore-scripts first, then rebuild**:
   ```dockerfile
   npm install --no-audit --ignore-scripts
   npm rebuild
   ```

## Alternative Solutions

If the above solutions don't work, you can also try:

1. **Use a glibc-based image instead of Alpine**:
   Change `FROM node:20-alpine` to `FROM node:20-slim`
   
2. **Pin rollup to an older version** that doesn't have platform-specific dependencies

3. **Use Bun instead of npm** (if the project supports it):
   The project seems to have bun scripts available

## Deployment on Zeabur

Since this appears to be deploying on Zeabur (based on the `dockerhub.zeabur.cloud` registry), you may need to:

1. Update your deployment configuration to use one of the fixed Dockerfiles
2. Or update the existing Dockerfile with the fixes shown above
3. Clear any build cache on Zeabur before rebuilding

## References

- [npm issue with optional dependencies](https://github.com/npm/cli/issues/4828)
- [Rollup platform-specific dependencies](https://github.com/rollup/rollup/issues/4273) 