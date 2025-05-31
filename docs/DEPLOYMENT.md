# Deployment Troubleshooting Guide

## Zeabur Deployment Issues

### Problem: Build fails after successful initial deployment

This is a common issue where the first deployment succeeds but subsequent builds fail. Here are the main causes and solutions:

### 1. TypeScript Configuration Issues

**Problem**: `Cannot find package 'vite'` or similar module resolution errors.

**Solution**: 
- Ensure `vite.config.ts` is not excluded from TypeScript compilation
- Check that `tsconfig.json` includes the config file
- Use `NODE_OPTIONS="--max-old-space-size=3072"` for sufficient memory

### 2. Dependency Cache Issues

**Problem**: npm/node_modules inconsistencies between builds.

**Solution**:
- Use `npm ci --frozen-lockfile` instead of `npm install`
- Clear cache between builds
- Ensure `.dockerignore` excludes `node_modules`

### 3. Memory Issues

**Problem**: Build fails with out-of-memory errors.

**Solution**:
- Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=3072"`
- Use production builds for dependencies
- Optimize chunk sizes in Vite config

### 4. Environment Variables

**Problem**: Missing or incorrect environment variables.

**Solution**:
- Ensure `NODE_ENV=production` is set
- Check all required environment variables are available
- Use `.env.example` as reference

## Testing Build Locally

Before pushing to Zeabur, test the build locally:

```bash
npm run test:build
```

This script will:
1. Install dependencies with `npm ci`
2. Clean previous builds
3. Build all packages in correct order
4. Build frontend with production settings

## Files Added for Stability

- `zeabur.json` - Zeabur-specific configuration
- `nixpacks.toml` - Nixpacks configuration for consistent builds
- `.zeaburignore` - Files to exclude from Zeabur builds
- `.nvmrc` - Lock Node.js version
- `scripts/test-build.sh` - Local build testing script
- `client/tsconfig.build.json` - Separate TypeScript config for builds

## Key Changes Made

1. **Fixed TypeScript Config**: Removed `vite.config.ts` from exclude list
2. **Optimized Build Scripts**: Simplified and made more reliable
3. **Memory Management**: Increased Node.js memory allocation
4. **Dependency Management**: Use `npm ci --frozen-lockfile` for reproducible builds
5. **Build Order**: Ensure packages build before frontend

## If Build Still Fails

1. Check Zeabur build logs for specific errors
2. Verify Node.js version matches `.nvmrc`
3. Ensure all environment variables are set correctly
4. Try clearing Zeabur build cache
5. Test build locally with `npm run test:build`

## Environment Variables Checklist

Make sure these are set in Zeabur:
- `NODE_ENV=production`
- `HOST=0.0.0.0`
- All LibreChat-specific variables from `.env.example`
