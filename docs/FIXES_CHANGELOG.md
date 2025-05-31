# Fix Changelog

## 2025-05-29 - Vite Path Issue Fix

### Changed
- `client/package.json`: Fixed build:docker script path from `../node_modules/.bin/vite` to `vite`
- `zbpack.json`: Updated build command to ensure client dependencies installation

### Impact
- ✅ Resolves "vite: not found" build errors
- ✅ Fixes Zeabur deployment issues
- ✅ Improves Docker build reliability

### Files Modified
- `/client/package.json` (line 10)
- `/zbpack.json` (build_command)

### Risk Level
**LOW** - Minimal change following npm best practices

---

*For detailed analysis see: VITE_PATH_FIX_REPORT.md*
