# LibreChat Single-SPA Microfrontend Setup

This document explains how to build and run LibreChat in microfrontend mode using Single-SPA architecture.

## Architecture Overview

LibreChat's microfrontend architecture consists of:

- **Root Application** (`sspa-root`): Orchestrates all microfrontends using Single-SPA
- **Custom Header Microfrontend** (`custom_microfrontend`): A custom header displayed at the top
- **LibreChat Microfrontend** (`client`): The main LibreChat application
- **Backend Server** (`api`): Serves static files and provides API endpoints

## Quick Start

### Prerequisites

- Node.js (v23 or higher)
- npm
- MongoDB (for backend)

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install

# Install custom microfrontend dependencies
cd ../custom_microfrontend
npm install

# Install sspa-root dependencies
cd ../sspa-root
npm install
cd ..
```

### 2. Build All Microfrontends

Use the automated build script to build all microfrontends:

```bash
npm run build:spa
```

This script will:
1. Build the custom header microfrontend
2. Build the LibreChat client as a microfrontend
3. Build the SSPA root application
4. Copy all assets to the correct locations

### 3. Start the Backend Server

```bash
npm run backend
```

This starts the backend server on `http://localhost:3080` and serves the microfrontend application.

### 4. Access the Application

Open your browser to `http://localhost:3080` to see the complete microfrontend application with:
- Custom header at the top
- LibreChat application below

## Development Workflow

### Building Individual Components

If you need to build components separately:

#### Build Custom Header Microfrontend
```bash
cd custom_microfrontend
npm run build
cd ..
```

#### Build LibreChat Client Microfrontend
```bash
cd client
npm run build:spa
cd ..
```

#### Build SSPA Root
```bash
cd sspa-root
npm run build
cd ..
```

### Development Mode (Optional)

For development with hot reload:

1. **Start the backend:**
   ```bash
   npm run backend:dev
   ```

2. **Start SSPA root in development mode:**
   ```bash
   cd sspa-root
   npm run dev
   ```

3. **Access development server:**
   Open `http://localhost:3090` (or port shown in terminal)

## Project Structure

```
LibreChat/
├── custom_microfrontend/          # Custom header microfrontend
│   ├── src/
│   │   ├── CustomHeader.jsx       # Header component
│   │   └── main.jsx               # Entry point
│   ├── package.json
│   └── vite.config.js
├── client/                        # LibreChat client (microfrontend)
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── sspa-root/                     # Single-SPA root application
│   ├── src/
│   │   └── main.js                # Microfrontend registration
│   ├── dist/                      # Built assets served by backend
│   │   ├── custom-header-dist/    # Custom header assets
│   │   ├── client-dist/           # LibreChat client assets
│   │   └── index.html             # Main HTML file
│   ├── package.json
│   └── vite.config.js
├── api/                           # Backend server
│   └── config/
│       └── paths.js               # Modified to serve sspa-root/dist
└── scripts/
    └── build-spa.js               # Automated build script
```

## Configuration Details

### Backend Configuration

The backend (`api/config/paths.js`) has been modified to serve the SSPA root instead of the regular client:

```javascript
module.exports = {
  // ... other paths
  clientPath: path.resolve(__dirname, '..', '..', 'sspa-root'),
  dist: path.resolve(__dirname, '..', '..', 'sspa-root', 'dist'),
  publicPath: path.resolve(__dirname, '..', '..', 'sspa-root', 'public'),
  // ...
};
```

### Microfrontend Registration

The SSPA root registers microfrontends in order:

1. **Custom Header**: Always active, positioned at top
2. **LibreChat**: Main application content

## Build Scripts

### Automated Build (`scripts/build-spa.js`)

The automated build script orchestrates the entire build process:

```bash
npm run build:spa
```

This script:
- Builds all microfrontends with production optimizations
- Copies assets to the SSPA root distribution folder
- Ensures cross-platform compatibility (no symbolic links)

### Individual Build Commands

Each microfrontend can be built independently:

```bash
# Custom header
cd custom_microfrontend && npm run build

# LibreChat client  
cd client && npm run build:spa

# SSPA root
cd sspa-root && npm run build
```

## Troubleshooting

### Common Issues

1. **"Custom header sample" not appearing:**
   - Ensure all microfrontends are built: `npm run build:spa`
   - Check browser console for JavaScript errors
   - Verify backend is running: `npm run backend`

2. **"process is not defined" errors:**
   - This issue has been resolved with production build configurations
   - Re-run the build: `npm run build:spa`

3. **404 errors for microfrontend assets:**
   - Verify assets are copied correctly to `sspa-root/dist/`
   - Check that backend is serving from the correct path

4. **API errors:**
   - Ensure MongoDB is running
   - Check that backend started successfully on port 3080
   - Verify environment variables are configured

### Debugging Steps

1. **Check build output:**
   ```bash
   ls -la sspa-root/dist/
   ls -la sspa-root/dist/custom-header-dist/
   ls -la sspa-root/dist/client-dist/
   ```

2. **Verify file serving:**
   ```bash
   curl http://localhost:3080/custom-header-dist/custom-header.umd.js
   curl http://localhost:3080/client-dist/librechat.umd.js
   ```

3. **Check browser console:**
   - Open browser developer tools
   - Look for network errors or JavaScript errors
   - Verify microfrontend modules load successfully

## Additional Features

### Custom Header Microfrontend

The custom header demonstrates:
- React component in microfrontend
- Fixed positioning at page top
- Proper styling and z-index management
- Integration with Single-SPA lifecycle

### Cross-Platform Compatibility

The build system avoids symbolic links for cross-platform compatibility:
- File copying instead of symlinks
- Cross-environment build scripts
- Production-optimized builds

## Further Reading

- [Single-SPA Documentation](https://single-spa.js.org/)
- [Microfrontend Architecture](https://micro-frontends.org/)
- [LibreChat Documentation](./README.md)