# LibreChat SPA (Single Page Application) Architecture

This setup eliminates the need for symbolic links by using build scripts that copy microfrontend assets directly.

## 🏗️ Architecture Overview

```
LibreChat/
├── client/                     # Main LibreChat client (as microfrontend)
├── custom_microfrontend/       # Custom header microfrontend  
├── sspa-root/                  # Root SPA application
└── scripts/                    # Build scripts
    └── build-spa.js           # Main SPA build script
```

## 🚀 Quick Start

### Build and Run SPA
```bash
# Build all microfrontends and serve via backend
npm run spa:build
npm run backend

# Visit http://localhost:3080 to see the SPA with custom header
```

### Development Mode
```bash
# For SPA development (rebuilds and starts backend)
npm run spa:dev

# For individual microfrontend development
cd custom_microfrontend && npm run dev  # Port 3091
cd sspa-root && npm run dev              # Port 3090
```

## 📦 Build Process

The build process works in these steps:

1. **Build LibreChat Client Microfrontend**
   ```bash
   cd client && npm run build:spa
   # Creates: client/dist/spa/librechat.umd.js + librechat.css
   ```

2. **Build Custom Header Microfrontend**
   ```bash
   cd custom_microfrontend && npm run build  
   # Creates: custom_microfrontend/dist/custom-header.umd.js
   ```

3. **Build and Copy SSPA-Root**
   ```bash
   cd sspa-root && npm run build
   # Creates: sspa-root/dist/ with copied microfrontend assets
   ```

4. **Backend Serves SSPA-Root**
   - Backend serves `sspa-root/dist/` instead of `client/dist/`
   - All microfrontends are loaded via the root application

## 🔧 Configuration Changes

### Modified Files:
- `api/config/paths.js` - Updated to serve sspa-root instead of client
- `package.json` - Added `spa:build` and `spa:dev` scripts
- `sspa-root/package.json` - Added postbuild asset copying

### No Symbolic Links Required:
- ✅ Cross-platform compatible (Windows, macOS, Linux)
- ✅ Works with any Git setup
- ✅ No administrator privileges needed
- ✅ Clean repository structure

## 📁 File Structure After Build

```
sspa-root/dist/
├── index.html                 # Main SPA entry point
├── assets/                    # Root app assets
├── client-dist/               # LibreChat microfrontend assets
│   ├── librechat.umd.js
│   ├── librechat.css
│   └── assets/
└── custom-header-dist/        # Custom header microfrontend assets
    └── custom-header.umd.js
```

## 🔄 Development Workflow

### Adding New Microfrontends:
1. Create new microfrontend folder
2. Add to `scripts/build-spa.js`
3. Add to `sspa-root/scripts/copy-assets.js`
4. Register in `sspa-root/src/main.js`

### Making Changes:
```bash
# After modifying any microfrontend:
npm run spa:build

# For faster development iterations:
cd <microfrontend-folder>
npm run build
cd ../sspa-root
npm run copy-assets
```

## 🌐 URLs

- **Production**: `http://localhost:3080` (served by backend)
- **SPA Development**: `http://localhost:3090` (sspa-root dev server)
- **Custom Header Dev**: `http://localhost:3091` (custom header dev server)

## ✨ Benefits

- **No Platform Dependencies**: Works on Windows, macOS, and Linux
- **Git Friendly**: No symbolic link issues in repositories
- **Team Friendly**: Anyone can clone and build without special setup
- **CI/CD Ready**: Build scripts work in any automated environment
- **Maintainable**: Clear separation between microfrontends and build process