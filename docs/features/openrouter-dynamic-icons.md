# OpenRouter Dynamic Provider Icons

## Overview

LibreChat now supports dynamic loading of provider-specific icons for OpenRouter models. Instead of showing a generic OpenRouter icon for all models, the interface displays the actual provider's icon (Google for Gemini, Meta for Llama, etc.).

## Features

### Dynamic Icon Loading
- **Automatic CDN Loading**: Icons are dynamically loaded from LobeHub's CDN (`https://icons.lobehub.com/`)
- **Smart Caching**: Icons are cached in memory to avoid repeated network requests
- **Fallback Chain**: Comprehensive fallback system ensures icons always display:
  1. Try LobeHub CDN (SVG format)
  2. Try LobeHub CDN (PNG format)
  3. Use local asset if available
  4. Fall back to stylized letter icon

### User Control
- Toggle provider icons on/off in Settings → General
- Setting persists across sessions via localStorage
- Default: Enabled (shows provider icons)

### Performance Optimizations
- **In-Memory Caching**: Loaded icons are cached to prevent redundant CDN calls
- **Lazy Loading**: Icons load on-demand as components render
- **Loading States**: Smooth skeleton animation while icons load
- **Error Handling**: Graceful fallback to letter icons on CDN failures

## Supported Providers

The system supports all 50+ OpenRouter providers with automatic icon loading:

### Major Providers (with CDN icons)
- OpenAI, Anthropic, Google, Meta, Microsoft/Azure
- Amazon, NVIDIA, Mistral, Cohere, Perplexity
- DeepSeek, Alibaba/Qwen, ByteDance, Baidu
- Hugging Face, AI21 Labs, Inflection, and more

### Community Providers (letter icon fallback)
- Individual researchers and community models
- Automatically generate unique colored letter icons
- Consistent visual differentiation

## Technical Implementation

### Component Architecture

```typescript
// DynamicProviderIcon.tsx
- Handles async icon loading
- Manages caching and fallback logic
- Provides loading and error states

// MinimalIcon.tsx
- Integrates DynamicProviderIcon for OpenRouter
- Maintains backward compatibility
- Respects user preferences
```

### Icon Resolution Logic

```javascript
1. Extract provider from model ID (e.g., "google/gemini-2.0" → "google")
2. Check if user has provider icons enabled
3. If built-in component exists (Google, OpenAI, etc.), use it
4. Otherwise, use DynamicProviderIcon:
   - Check local cache
   - Try CDN (SVG then PNG)
   - Fall back to letter icon
```

### Caching Strategy
- Global `Map` stores loaded icon URLs
- Cache persists for entire session
- Failed lookups are cached as `null` to prevent retry storms
- Manual cache clearing available via `clearIconCache()`

## Configuration

### Enable/Disable Provider Icons

1. Open Settings (gear icon)
2. Navigate to General tab
3. Toggle "Show provider icons for OpenRouter models"
4. Changes apply immediately

### Adding Custom Provider Icons

To add local icons for specific providers:

1. Add icon file to `/client/public/assets/`
2. Update `LOCAL_ASSETS` in `DynamicProviderIcon.tsx`:

```typescript
const LOCAL_ASSETS: Record<string, string> = {
  'your-provider': '/assets/your-provider.png',
  // ... existing entries
};
```

## Testing

### Verify CDN Availability
```bash
npm run test:provider-icons
# or
node scripts/test-provider-icons.js
```

### Manual Testing
1. Select OpenRouter as provider
2. Choose different models (Gemini, Claude via OR, Llama, etc.)
3. Verify correct icons appear
4. Toggle setting and verify OpenRouter icon returns
5. Test with slow network (DevTools throttling)

## Troubleshooting

### Icons Not Loading
- Check network tab for CDN requests
- Verify CORS headers allow cross-origin requests
- Check browser console for errors
- Try clearing cache: Open DevTools Console, run `clearIconCache()`

### Wrong Icon Displayed
- Verify model ID format includes provider prefix
- Check provider name normalization (lowercase)
- Ensure latest version deployed

### Performance Issues
- Icons are cached after first load
- Consider preloading common providers
- Check network latency to CDN

## Future Enhancements

- [ ] Preload common provider icons on app start
- [ ] Add WebP format support for better compression
- [ ] Implement localStorage persistence for cache
- [ ] Support custom CDN endpoints
- [ ] Add provider icon customization UI

## API Reference

### DynamicProviderIcon Component

```typescript
interface DynamicProviderIconProps {
  provider: string;      // Provider identifier
  size?: number;         // Icon size (default: 20)
  className?: string;    // Additional CSS classes
}
```

### Utility Functions

```typescript
// Clear the icon cache
clearIconCache(): void

// Preload icons for better performance
preloadProviderIcons(providers: string[]): Promise<void>

// Extract provider from model ID
getOpenRouterProvider(model: string): string | null
```

## Migration Notes

This feature is backward compatible. Existing deployments will:
- Continue working with static icons
- Gradually adopt dynamic loading
- Maintain all current functionality
- Preserve user settings

No migration steps required - the feature activates automatically.