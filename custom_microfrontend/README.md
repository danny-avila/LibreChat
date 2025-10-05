# Custom Header Microfrontend

This is a custom header microfrontend for LibreChat that displays "Custom header sample" at the top of the application.

## Development

To run the microfrontend in standalone mode:

```bash
npm install
npm run dev
```

This will start the development server on `http://localhost:3091`.

## Building

To build the microfrontend for production:

```bash
npm run build
```

This creates the UMD bundle that can be loaded by the sspa-root application.

## Integration

The microfrontend is automatically registered and loaded by the sspa-root application when properly configured.