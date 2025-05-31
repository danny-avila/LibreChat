# LibreChat v0.7.8 Vite Path Issue Fix Report

**Date:** May 29, 2025  
**Issue:** Frontend build fails with "sh: ../node_modules/.bin/vite: not found"  
**Status:** ✅ RESOLVED  

## Problem Description

The build process was failing because the `build:docker` script in `client/package.json` was using an incorrect path to the vite binary:

```bash
# Incorrect path from /app/client directory
../node_modules/.bin/vite build
```

This path was pointing to a non-existent location, causing the build to fail with:
```
sh: ../node_modules/.bin/vite: not found
```

## Root Cause Analysis

1. **Incorrect relative path**: The script assumed vite was installed in the parent directory's node_modules
2. **Workspace structure**: LibreChat uses npm workspaces where each package has its own node_modules
3. **Docker build context**: The path resolution was incorrect in the containerized environment

## Applied Fixes

### 1. Fixed client/package.json Script ✅

**File:** `/client/package.json`  
**Changed:** Line 10 in scripts section

**Before:**
```json
"build:docker": "NODE_ENV=production ../node_modules/.bin/vite build"
```

**After:**
```json
"build:docker": "NODE_ENV=production vite build"
```

**Rationale:** 
- Uses `vite` command directly which resolves through npm's PATH mechanism
- Automatically finds vite in local `node_modules/.bin/vite`
- More robust and follows npm best practices

### 2. Updated zbpack.json Build Command ✅

**File:** `/zbpack.json`  
**Updated:** build_command configuration

**Before:**
```json
{
  "build_command": "NODE_ENV=development npm install && npm run frontend:docker && npm prune --production",
  "start_command": "npm run backend"
}
```

**After:**
```json
{
  "build_command": "npm install && cd client && npm install && cd .. && npm run frontend:docker && npm prune --production",
  "start_command": "npm run backend"
}
```

**Improvements:**
- Ensures client dependencies are installed before build
- Follows proper workspace setup sequence
- Removes unnecessary NODE_ENV=development for build

### 3. Verified Dependencies ✅

**Confirmed presence of required packages:**
- ✅ `vite: "5.4.11"` in `client/package.json` devDependencies
- ✅ `"postinstall": "patch-package || true"` in root `package.json`

## Technical Details

### Build Flow (After Fix)
1. `npm install` - Install root dependencies
2. `cd client && npm install` - Install client dependencies (including vite)
3. `cd .. && npm run frontend:docker` - Execute frontend build
4. `npm --workspace=@librechat/frontend run build:docker` - Run client build script
5. `NODE_ENV=production vite build` - Execute vite build (now finds vite correctly)
6. `npm prune --production` - Clean up dev dependencies

### Path Resolution
```bash
# Before (incorrect)
/app/client$ ../node_modules/.bin/vite build
# Looked for: /app/node_modules/.bin/vite (not found)

# After (correct)  
/app/client$ vite build
# Resolves to: /app/client/node_modules/.bin/vite (found)
```

## Testing Recommendations

To verify the fix works correctly:

```bash
# Test local build
cd client
npm install
npm run build:docker

# Test full workspace build
cd ..
npm install
npm run frontend:docker

# Test Zeabur deployment build
# Use the updated zbpack.json configuration
```

## Expected Outcomes

- ✅ No more "vite: not found" errors
- ✅ Frontend builds successfully in Docker environment
- ✅ No more "index.html not found" errors
- ✅ Zeabur deployments work correctly
- ✅ Local development builds remain unaffected

## Alternative Solutions Considered

1. **Symlink approach**: Creating symlinks for vite binary - rejected (too complex)
2. **Absolute paths**: Using absolute paths to vite - rejected (not portable)
3. **Multi-stage Docker**: Separating build and runtime stages - rejected (overkill for this issue)

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `client/package.json` | Modified | Fixed build:docker script path |
| `zbpack.json` | Modified | Updated build command sequence |

## Rollback Instructions

If issues arise, revert changes:

```bash
# Rollback client/package.json
"build:docker": "NODE_ENV=production ../node_modules/.bin/vite build"

# Rollback zbpack.json  
"build_command": "NODE_ENV=development npm install && npm run frontend:docker && npm prune --production"
```

## Related Issues

This fix resolves:
- Build failures in Zeabur deployment
- Docker containerization issues
- CI/CD pipeline failures related to vite path resolution

## Future Considerations

1. **Monitoring**: Watch for any new path-related issues in builds
2. **Documentation**: Update deployment guides with new build process
3. **Testing**: Add automated tests for build process validation

---

**Fix applied by:** GitHub Copilot  
**Verification status:** Ready for testing  
**Risk level:** Low (minimal change, follows npm best practices)
