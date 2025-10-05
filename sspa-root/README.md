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

1. **Start the LibreChat Backend (required):**
   ```bash
   cd ..
   npm run backend:dev
   ```
   This starts the API server on `http://localhost:3080` that the microfrontend needs for authentication and API calls.

2. **Build the Client Microfrontend:**
   ```bash
   cd ../client
   npm run build:spa
   ```
   This creates the microfrontend bundle that the root app will load.

3. **Start the Root Application:**
   ```bash
   cd sspa-root
   npm install
   npm run dev
   ```
   This will start the root application on `http://localhost:3090` (or next available port).

4. **Access the Application:**
   Open your browser to `http://localhost:3090` (or the port shown in terminal) to see the complete application.

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
   
2. **API 404 Errors (auth/refresh, etc.)**: 
   - Ensure the LibreChat backend is running: `cd .. && npm run backend:dev`
   - Check that the backend is accessible at `http://localhost:3080`

3. **Port Conflicts**: 
   - Root app will try port 3090, then use next available port
   - Check terminal output for actual port being used
   - Backend must be on port 3080

4. **CORS or Module Loading Errors**: 
   - Ensure the client microfrontend is built in microfrontend mode (`npm run build:spa`)
   - Check browser console for specific error messages

### Debugging

- Check browser console for any module loading errors
- Verify network tab shows successful loading of microfrontend modules
- Ensure both applications are running on correct ports

## API Integration

The client microfrontend maintains its existing API integration with the backend server on port 3080. The root application simply orchestrates the frontend; all backend communication remains unchanged.