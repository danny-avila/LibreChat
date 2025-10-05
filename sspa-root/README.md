# LibreChat Single-SPA Root Application

This is the root application for LibreChat's microfrontend architecture using Single-SPA.

## Overview

The `sspa-root` application serves as the orchestrator for LibreChat's microfrontend setup. It manages the loading and mounting of the main LibreChat client application as a microfrontend.

## Architecture

- **Root Application**: Manages microfrontend registration and routing
- **Client Microfrontend**: The main LibreChat application converted to run as a microfrontend

## Development Setup

### Prerequisites

Make sure you have Node.js and npm installed.

### Running in Development Mode

1. **Build the Client Microfrontend first:**
   ```bash
   cd ../client
   npm run build:spa
   ```
   This creates the microfrontend bundle that the root app will load.

2. **Start the Client Dev Server (optional, for API proxying):**
   ```bash
   cd ../client
   npm run dev
   ```
   This will start the client dev server on `http://localhost:3090` for API proxying.

3. **Start the Root Application:**
   ```bash
   cd sspa-root
   npm install
   npm run dev
   ```
   This will start the root application on `http://localhost:3091`.

4. **Access the Application:**
   Open your browser to `http://localhost:3091` to see the complete application.

### Building for Production

1. **Build the Client Microfrontend:**
   ```bash
   cd ../client
   npm run build:spa
   ```

2. **Build the Root Application:**
   ```bash
   cd sspa-root
   npm run build
   ```

## Configuration

### Client Configuration

The client has been modified to support both standalone and microfrontend modes:

- **Standalone mode**: Regular build with `npm run build` or `npm run dev`
- **Microfrontend mode**: Build with `npm run build:spa` or `npm run dev:spa`

### Root Application Configuration

The root application is configured to:
- Load the client microfrontend from `http://localhost:3090` in development
- Handle CORS and module federation
- Manage application lifecycle and routing

## File Structure

```
sspa-root/
├── index.html          # Main HTML file with script imports
├── package.json        # Dependencies and scripts
├── vite.config.js     # Vite configuration
└── src/
    └── main.js        # Single-SPA configuration and app registration
```

## Key Features

- **Development Support**: Automatic loading from dev server with fallback to built version
- **CORS Handling**: Proper CORS configuration for cross-origin module loading
- **Loading States**: Built-in loading indicators during microfrontend bootstrap
- **Error Handling**: Graceful error boundaries and fallback mechanisms

## Troubleshooting

### Common Issues

1. **"Microfrontend Not Found" Error**: 
   - Make sure you've built the client microfrontend: `cd ../client && npm run build:spa`
   - Check that the file exists: `../client/dist/librechat.es.js`
   
2. **CORS Errors**: Make sure the client dev server (port 3090) is running if you need API access

3. **Module Loading Errors**: Ensure the client is built in microfrontend mode (`npm run build:spa`)

4. **Port Conflicts**: Check that ports 3090 and 3091 are available

### Debugging

- Check browser console for any module loading errors
- Verify network tab shows successful loading of microfrontend modules
- Ensure both applications are running on correct ports

## API Integration

The client microfrontend maintains its existing API integration with the backend server on port 3080. The root application simply orchestrates the frontend; all backend communication remains unchanged.