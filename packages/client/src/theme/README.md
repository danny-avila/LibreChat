# Dynamic Theme System for @librechat/client

This theme system allows you to dynamically change colors in your React application using CSS variables and Tailwind CSS. It combines dark/light mode switching with dynamic color theming capabilities.

## Table of Contents
- [Overview](#overview)
- [How It Works](#how-it-works)
- [Basic Usage](#basic-usage)
- [Available Theme Colors](#available-theme-colors)
- [Creating Custom Themes](#creating-custom-themes)
- [Environment Variable Themes](#environment-variable-themes)
- [Dark/Light Mode](#darklight-mode)
- [Migration Guide](#migration-guide)
- [Implementation Details](#implementation-details)
- [Troubleshooting](#troubleshooting)

## Overview

The theme system provides:
1. **Dark/Light Mode Switching** - Automatic theme switching based on user preference
2. **Dynamic Color Theming** - Change colors at runtime without recompiling CSS
3. **CSS Variable Based** - Uses CSS custom properties for performance
4. **Tailwind Integration** - Works seamlessly with Tailwind CSS utilities
5. **TypeScript Support** - Full type safety for theme definitions

## How It Works

The theme system operates in three layers:

1. **CSS Variables Layer**: Default colors defined in your app's CSS
2. **ThemeProvider Layer**: React context that manages theme state and applies CSS variables
3. **Tailwind Layer**: Maps CSS variables to Tailwind utility classes

### Default Behavior (No Custom Theme)
- CSS variables cascade from your app's `style.css` definitions
- Light mode uses variables under `html` selector
- Dark mode uses variables under `.dark` selector
- No JavaScript intervention in color values

### Custom Theme Behavior
- Only applies when `themeRGB` prop is provided
- Overrides CSS variables with `rgb()` formatted values
- Maintains compatibility with existing CSS

## Basic Usage

### 1. Install the Component Library

```bash
npm install @librechat/client
```

### 2. Wrap Your App with ThemeProvider

```tsx
import { ThemeProvider } from '@librechat/client';

function App() {
  return (
    <ThemeProvider initialTheme="system">
      <YourApp />
    </ThemeProvider>
  );
}
```

### 3. Set Up Your Base CSS

Ensure your app has CSS variables defined as fallbacks:

```css
/* style.css */
:root {
  --white: #fff;
  --gray-800: #212121;
  --gray-100: #ececec;
  /* ... other color definitions */
}

html {
  --text-primary: var(--gray-800);
  --surface-primary: var(--white);
  /* ... other theme variables */
}

.dark {
  --text-primary: var(--gray-100);
  --surface-primary: var(--gray-900);
  /* ... other dark theme variables */
}
```

### 4. Configure Tailwind

Update your `tailwind.config.js`:

```js
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    // Include component library files
    './node_modules/@librechat/client/dist/**/*.js',
  ],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        // Map CSS variables to Tailwind colors
        'text-primary': 'var(--text-primary)',
        'surface-primary': 'var(--surface-primary)',
        'brand-purple': 'var(--brand-purple)',
        // ... other colors
      },
    },
  },
};
```

### 5. Use Theme Colors in Components

```tsx
function MyComponent() {
  return (
    <div className="bg-surface-primary text-text-primary border border-border-light">
      <h1 className="text-text-secondary">Hello World</h1>
      <button className="bg-surface-submit hover:bg-surface-submit-hover text-white">
        Submit
      </button>
    </div>
  );
}
```

## Available Theme Colors

### Text Colors
- `text-text-primary` - Primary text color
- `text-text-secondary` - Secondary text color
- `text-text-secondary-alt` - Alternative secondary text
- `text-text-tertiary` - Tertiary text color
- `text-text-warning` - Warning text color

### Surface Colors
- `bg-surface-primary` - Primary background
- `bg-surface-secondary` - Secondary background
- `bg-surface-tertiary` - Tertiary background
- `bg-surface-submit` - Submit button background
- `bg-surface-destructive` - Destructive action background
- `bg-surface-dialog` - Dialog/modal background
- `bg-surface-chat` - Chat interface background

### Border Colors
- `border-border-light` - Light border
- `border-border-medium` - Medium border
- `border-border-heavy` - Heavy border
- `border-border-xheavy` - Extra heavy border

### Other Colors
- `bg-brand-purple` - Brand purple color
- `bg-presentation` - Presentation background
- `ring-ring-primary` - Focus ring color

## Creating Custom Themes

### 1. Define Your Theme

```tsx
import { IThemeRGB } from '@librechat/client';

export const customTheme: IThemeRGB = {
  'rgb-text-primary': '0 0 0',        // Black
  'rgb-text-secondary': '100 100 100', // Gray
  'rgb-surface-primary': '255 255 255', // White
  'rgb-surface-submit': '0 128 0',     // Green
  'rgb-brand-purple': '138 43 226',    // Blue Violet
  // ... define other colors
};
```

### 2. Use Your Custom Theme

```tsx
import { ThemeProvider } from '@librechat/client';
import { customTheme } from './themes/custom';

function App() {
  return (
    <ThemeProvider themeRGB={customTheme} themeName="custom">
      <YourApp />
    </ThemeProvider>
  );
}
```

## Environment Variable Themes

Load theme colors from environment variables:

### 1. Create Environment Variables

```env
# .env.local
REACT_APP_THEME_BRAND_PURPLE=171 104 255
REACT_APP_THEME_TEXT_PRIMARY=33 33 33
REACT_APP_THEME_TEXT_SECONDARY=66 66 66
REACT_APP_THEME_SURFACE_PRIMARY=255 255 255
REACT_APP_THEME_SURFACE_SUBMIT=4 120 87
```

### 2. Create a Theme Loader

```tsx
function getThemeFromEnv(): IThemeRGB | undefined {
  // Check if any theme environment variables are set
  const hasThemeEnvVars = Object.keys(process.env).some(key => 
    key.startsWith('REACT_APP_THEME_')
  );

  if (!hasThemeEnvVars) {
    return undefined; // Use default themes
  }

  return {
    'rgb-text-primary': process.env.REACT_APP_THEME_TEXT_PRIMARY || '33 33 33',
    'rgb-brand-purple': process.env.REACT_APP_THEME_BRAND_PURPLE || '171 104 255',
    // ... other colors
  };
}
```

### 3. Apply Environment Theme

```tsx
<ThemeProvider 
  initialTheme="system"
  themeRGB={getThemeFromEnv()}
>
  <App />
</ThemeProvider>
```

## Dark/Light Mode

The ThemeProvider handles dark/light mode automatically:

### Using the Theme Hook

```tsx
import { useTheme } from '@librechat/client';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Current theme: {theme}
    </button>
  );
}
```

### Theme Options
- `'light'` - Force light mode
- `'dark'` - Force dark mode
- `'system'` - Follow system preference

## Migration Guide

If you're migrating from an older theme system:

### 1. Update Imports

**Before:**
```tsx
import { ThemeContext, ThemeProvider } from '~/hooks/ThemeContext';
```

**After:**
```tsx
import { ThemeContext, ThemeProvider } from '@librechat/client';
```

### 2. Update ThemeProvider Usage

The new ThemeProvider is backward compatible but adds new capabilities:

```tsx
<ThemeProvider 
  initialTheme="system"  // Same as before
  themeRGB={customTheme} // New: optional custom colors
>
  <App />
</ThemeProvider>
```

### 3. Existing Components

Components using ThemeContext continue to work without changes:

```tsx
// This still works!
const { theme, setTheme } = useContext(ThemeContext);
```

## Implementation Details

### File Structure
```
packages/client/src/theme/
├── context/
│   └── ThemeProvider.tsx    # Main theme provider
├── types/
│   └── index.ts            # TypeScript interfaces
├── themes/
│   ├── default.ts          # Light theme colors
│   ├── dark.ts             # Dark theme colors
│   └── index.ts            # Theme exports
├── utils/
│   ├── applyTheme.ts       # Apply CSS variables
│   ├── tailwindConfig.ts   # Tailwind helpers
│   └── createTailwindColors.js
├── README.md               # This documentation
└── index.ts               # Main exports
```

### CSS Variable Format

The theme system uses RGB values in CSS variables:
- CSS Variable: `--text-primary: rgb(33 33 33)`
- Theme Definition: `'rgb-text-primary': '33 33 33'`
- Tailwind Usage: `text-text-primary`

### RGB Format Requirements

All color values must be in space-separated RGB format:
- ✅ Correct: `'255 255 255'`
- ❌ Incorrect: `'#ffffff'` or `'rgb(255, 255, 255)'`

This format allows Tailwind to apply opacity modifiers like `bg-surface-primary/50`.

## Troubleshooting

### Common Issues

#### 1. Colors Not Applying
- **Issue**: Custom theme colors aren't showing
- **Solution**: Ensure you're passing the `themeRGB` prop to ThemeProvider
- **Check**: CSS variables in DevTools should show `rgb(R G B)` format

#### 2. Circular Reference Errors
- **Issue**: `--brand-purple: var(--brand-purple)` creates infinite loop
- **Solution**: Use direct color values: `--brand-purple: #ab68ff`

#### 3. Dark Mode Not Working
- **Issue**: Dark mode doesn't switch
- **Solution**: Ensure `darkMode: ['class']` is in your Tailwind config
- **Check**: The `<html>` element should have `class="dark"` in dark mode

#### 4. TypeScript Errors
- **Issue**: Type errors when defining themes
- **Solution**: Import and use the `IThemeRGB` interface:
```tsx
import { IThemeRGB } from '@librechat/client';
```

### Debugging Tips

1. **Check CSS Variables**: Use browser DevTools to inspect computed CSS variables
2. **Verify Theme Application**: Look for inline styles on the root element
3. **Console Errors**: Check for validation errors in the console
4. **Test Isolation**: Try a minimal theme to isolate issues

## Examples

### Dynamic Theme Switching

```tsx
import { ThemeProvider, defaultTheme, darkTheme } from '@librechat/client';
import { useState } from 'react';

function App() {
  const [isDark, setIsDark] = useState(false);
  
  return (
    <ThemeProvider 
      initialTheme={isDark ? 'dark' : 'light'}
      themeRGB={isDark ? darkTheme : defaultTheme}
      themeName={isDark ? 'dark' : 'default'}
    >
      <button onClick={() => setIsDark(!isDark)}>
        Toggle Theme
      </button>
      <YourApp />
    </ThemeProvider>
  );
}
```

### Multi-Theme Selector

```tsx
const themes = {
  default: undefined, // Use CSS defaults
  ocean: {
    'rgb-brand-purple': '0 119 190',
    'rgb-surface-primary': '240 248 255',
    // ... ocean theme colors
  },
  forest: {
    'rgb-brand-purple': '34 139 34',
    'rgb-surface-primary': '245 255 250',
    // ... forest theme colors
  },
};

function App() {
  const [selectedTheme, setSelectedTheme] = useState('default');
  
  return (
    <ThemeProvider 
      themeRGB={themes[selectedTheme]}
      themeName={selectedTheme}
    >
      <select onChange={(e) => setSelectedTheme(e.target.value)}>
        {Object.keys(themes).map(name => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
      <YourApp />
    </ThemeProvider>
  );
}
```

### Using with the Main Application

When using the ThemeProvider in your main application with localStorage persistence:

```tsx
import { ThemeProvider } from '@librechat/client';
import { getThemeFromEnv } from './utils';

function App() {
  const envTheme = getThemeFromEnv();
  
  return (
    <ThemeProvider 
      // Only pass props if you want to override stored values
      // If you always pass props, they will override localStorage
      initialTheme={envTheme ? "system" : undefined}
      themeRGB={envTheme || undefined}
    >
      {/* Your app content */}
    </ThemeProvider>
  );
}
```

**Important**: Props passed to ThemeProvider will override stored values on initial mount. Only pass props when you explicitly want to override the user's saved preferences.

## Contributing

When adding new theme colors:

1. Add the type definition in `types/index.ts`
2. Add the color to default and dark themes
3. Update the applyTheme mapping
4. Add to Tailwind configuration
5. Document in this README

## License

This theme system is part of the @librechat/client package. 