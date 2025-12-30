import { useContext, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import useSWR from 'swr';
import { Md5 } from 'ts-md5';
import { ThemeContext, isDark } from '@librechat/client';
import type { MermaidConfig } from 'mermaid';

// Constants
const MD5_LENGTH_THRESHOLD = 10_000;
const DEFAULT_ID_PREFIX = 'mermaid-diagram';

// Lazy load mermaid library (~2MB)
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

const loadMermaid = () => {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => mod.default);
  }

  return mermaidPromise;
};

interface UseMermaidOptions {
  /** Mermaid diagram content */
  content: string;
  /** Unique identifier for this diagram */
  id?: string;
  /** Custom mermaid theme */
  theme?: string;
  /** Custom mermaid configuration */
  config?: Partial<MermaidConfig>;
}

interface UseMermaidReturn {
  /** The rendered SVG string */
  svg: string | undefined;
  /** Loading state */
  isLoading: boolean;
  /** Error object if rendering failed */
  error: Error | undefined;
  /** Whether content is being validated */
  isValidating: boolean;
}

export const useMermaid = ({
  content,
  id = DEFAULT_ID_PREFIX,
  theme: customTheme,
  config,
}: UseMermaidOptions): UseMermaidReturn => {
  const { theme } = useContext(ThemeContext);
  const isDarkMode = isDark(theme);

  // Store last valid SVG for fallback on errors
  const [validContent, setValidContent] = useState<string>('');

  // Generate cache key based on content, theme, and ID
  const cacheKey = useMemo((): string => {
    // For large diagrams, use MD5 hash instead of full content
    const contentHash = content.length < MD5_LENGTH_THRESHOLD ? content : Md5.hashStr(content);

    // Include theme mode in cache key to handle theme switches
    const themeKey = customTheme || (isDarkMode ? 'd' : 'l');

    return [id, themeKey, contentHash].filter(Boolean).join('-');
  }, [content, id, isDarkMode, customTheme]);

  // Generate unique diagram ID (mermaid requires unique IDs in the DOM)
  // Include cacheKey to regenerate when content/theme changes, preventing mermaid internal conflicts
  const diagramId = useMemo(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${id}-${timestamp}-${random}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cacheKey]);

  // Build mermaid configuration
  const mermaidConfig = useMemo((): MermaidConfig => {
    const defaultTheme = isDarkMode ? 'dark' : 'neutral';

    return {
      startOnLoad: false,
      theme: (customTheme as MermaidConfig['theme']) || defaultTheme,
      // Spread custom config but override security settings after
      ...config,
      // Security hardening - these MUST come last to prevent override
      securityLevel: 'strict', // Highest security: disables click, sanitizes text
      maxTextSize: config?.maxTextSize ?? 50000, // Limit text size to prevent DoS
      maxEdges: config?.maxEdges ?? 500, // Limit edges to prevent DoS
    };
  }, [customTheme, isDarkMode, config]);

  // Fetch/render function
  const fetchSvg = async (): Promise<string> => {
    // SSR guard
    if (typeof window === 'undefined') {
      return '';
    }

    try {
      // Load mermaid library (cached after first load)
      const mermaidInstance = await loadMermaid();

      if (!mermaidInstance) {
        throw new Error('Failed to load mermaid library');
      }

      // Validate syntax first and capture detailed error
      try {
        await mermaidInstance.parse(content);
      } catch (parseError) {
        // Extract meaningful error message from mermaid's parse error
        let errorMessage = 'Invalid mermaid syntax';
        if (parseError instanceof Error) {
          errorMessage = parseError.message;
        } else if (typeof parseError === 'string') {
          errorMessage = parseError;
        }

        throw new Error(errorMessage);
      }

      // Initialize with config
      mermaidInstance.initialize(mermaidConfig);

      // Render to SVG
      const { svg } = await mermaidInstance.render(diagramId, content);

      // Sanitize SVG output with DOMPurify for additional security
      const purify = DOMPurify();
      const sanitizedSvg = purify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        // Allow additional elements used by mermaid for text rendering
        ADD_TAGS: ['foreignObject', 'use', 'switch'],
        ADD_ATTR: [
          'dominant-baseline',
          'text-anchor',
          'requiredFeatures',
          'systemLanguage',
          'xmlns:xlink',
        ],
      });

      // Store as last valid content
      setValidContent(sanitizedSvg);

      return sanitizedSvg;
    } catch (error) {
      console.error('Mermaid rendering error:', error);

      // Return last valid content if available (graceful degradation)
      if (validContent) {
        return validContent;
      }

      throw error;
    }
  };

  // Use SWR for caching and revalidation
  const { data, error, isLoading, isValidating } = useSWR<string, Error>(cacheKey, fetchSvg, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 3000,
    errorRetryCount: 2,
    errorRetryInterval: 1000,
    shouldRetryOnError: true,
  });

  return {
    svg: data,
    isLoading,
    error,
    isValidating,
  };
};

export default useMermaid;
