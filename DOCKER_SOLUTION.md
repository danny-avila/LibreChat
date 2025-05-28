# Docker Multi-Stage Build Solution for LibreChat

## Problem Summary

The original Docker build was failing with the error:
```
Cannot find module '/node_modules/vite/bin/vite.js'
```

This occurred because the `build:docker` script in `client/package.json` was trying to access Vite after `npm prune --production` had removed dev dependencies.

## Research Findings

Based on Docker best practices research:

1. **Multi-stage builds** are the recommended solution for this type of issue
2. This pattern separates build-time and runtime environments
3. It's a common pattern used by major projects and documented in Docker official guides
4. It results in smaller, more secure production images

## Solution: Multi-Stage Dockerfile

The new `Dockerfile.multi-stage` implements a two-stage build process:

### Stage 1: Builder
- Installs ALL dependencies (including devDependencies)
- Builds the React client using Vite
- Compiles all necessary assets

### Stage 2: Production
- Installs only production dependencies
- Copies built artifacts from the builder stage
- Results in a clean, minimal production image

## Key Benefits

1. **Resolves the Vite issue**: Vite is available during the build stage
2. **Smaller image size**: Final image only contains production dependencies
3. **Better security**: No dev tools in production
4. **Follows best practices**: Industry standard approach
5. **Build cache optimization**: Better layer caching

## Implementation

### 1. Test the solution
```bash
./scripts/test-multi-stage-build.sh
```

### 2. Deploy to production
Replace your existing Dockerfile:
```bash
mv Dockerfile Dockerfile.old
mv Dockerfile.multi-stage Dockerfile
```

### 3. Update build commands
For local testing:
```bash
docker build -t librechat .
```

For deployment platforms like Zeabur:
- The platform will automatically use the new Dockerfile
- No additional configuration changes needed

## File Changes Made

1. **Created**: `Dockerfile.multi-stage` - The optimized multi-stage build
2. **Created**: `scripts/test-multi-stage-build.sh` - Test script for the new approach
3. **Preserved**: All existing workarounds in the current Dockerfile as backup

## Comparison with Previous Fixes

| Approach | Pros | Cons |
|----------|------|------|
| Relative path fix | Quick, simple | Hacky, fragile |
| Build preservation | Works with current structure | Complex, error-prone |
| **Multi-stage build** | **Industry standard, robust, clean** | **Requires Docker knowledge** |

## Next Steps

1. ✅ **Test locally**: Run the test script to verify everything works
2. ⏳ **Deploy to Zeabur**: Replace Dockerfile and test deployment
3. ⏳ **Monitor**: Ensure the deployed application works correctly
4. ⏳ **Clean up**: Remove temporary workarounds once confirmed working

## Technical Details

The multi-stage build solves the core issue by:
1. Using a separate build environment where all dev dependencies are available
2. Running the build process with access to Vite and other build tools
3. Copying only the built artifacts to the production stage
4. Installing only production dependencies in the final image

This approach is used by major projects including:
- Next.js official Docker examples
- NestJS containerization guides
- Vite deployment documentation

## Rollback Plan

If the multi-stage build causes any issues, you can quickly rollback:
```bash
mv Dockerfile Dockerfile.multi-stage-backup
mv Dockerfile.old Dockerfile
```

The current working build remains available as a fallback.
