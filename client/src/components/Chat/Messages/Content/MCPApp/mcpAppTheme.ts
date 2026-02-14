export interface McpUiHostContext {
  theme: 'light' | 'dark';
  styles?: {
    variables?: Record<string, string>;
  };
  displayMode: 'inline' | 'fullscreen' | 'pip';
  availableDisplayModes: Array<'inline' | 'fullscreen' | 'pip'>;
  platform: string;
  locale: string;
  timeZone: string;
  userAgent: string;
  containerDimensions?: { maxHeight?: number; maxWidth?: number };
}

interface McpUiContainerDimensions {
  maxHeight?: number;
  maxWidth?: number;
}

export function getHostContext(
  theme: 'light' | 'dark',
  displayMode: 'inline' | 'fullscreen' | 'pip' = 'inline',
  containerDimensions?: McpUiContainerDimensions,
  allowFullscreen = true,
): McpUiHostContext {
  const root = getComputedStyle(document.documentElement);
  const fallbackMaxHeight =
    typeof window !== 'undefined' && Number.isFinite(window.innerHeight) && window.innerHeight > 0
      ? window.innerHeight
      : undefined;
  const fallbackMaxWidth =
    typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth > 0
      ? window.innerWidth
      : undefined;
  const resolvedDimensions: McpUiContainerDimensions = {
    maxHeight:
      containerDimensions?.maxHeight && containerDimensions.maxHeight > 0
        ? Math.round(containerDimensions.maxHeight)
        : fallbackMaxHeight,
    maxWidth:
      containerDimensions?.maxWidth && containerDimensions.maxWidth > 0
        ? Math.round(containerDimensions.maxWidth)
        : fallbackMaxWidth,
  };

  const resolvedDisplayMode =
    allowFullscreen || displayMode !== 'fullscreen' ? displayMode : 'inline';
  const availableDisplayModes: Array<'inline' | 'fullscreen' | 'pip'> = allowFullscreen
    ? ['inline', 'fullscreen']
    : ['inline'];

  return {
    theme,
    styles: {
      variables: {
        '--color-background-primary':
          root.getPropertyValue('--surface-primary').trim() ||
          (theme === 'dark' ? '#1a1a2e' : '#ffffff'),
        '--color-background-secondary':
          root.getPropertyValue('--surface-secondary').trim() ||
          (theme === 'dark' ? '#16213e' : '#f5f5f5'),
        '--color-text-primary':
          root.getPropertyValue('--text-primary').trim() ||
          (theme === 'dark' ? '#e0e0e0' : '#1a1a1a'),
        '--color-text-secondary':
          root.getPropertyValue('--text-secondary').trim() ||
          (theme === 'dark' ? '#a0a0a0' : '#666666'),
        '--color-border':
          root.getPropertyValue('--border-color').trim() ||
          (theme === 'dark' ? '#333' : '#e0e0e0'),
        '--color-accent':
          root.getPropertyValue('--accent-color').trim() || '#0066cc',
        '--font-sans':
          root.getPropertyValue('--font-family').trim() ||
          'system-ui, -apple-system, sans-serif',
        '--radius':
          root.getPropertyValue('--border-radius').trim() || '0.5rem',
      },
    },
    displayMode: resolvedDisplayMode,
    availableDisplayModes,
    platform: 'web',
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: 'LibreChat',
    containerDimensions: resolvedDimensions,
  };
}
