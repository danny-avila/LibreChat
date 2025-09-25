import React, { useState, useEffect, memo } from 'react';

// Global cache for loaded icon URLs to avoid repeated CDN checks
const iconCache = new Map<string, string | null>();

// Known local assets that we want to prioritize over CDN
const LOCAL_ASSETS: Record<string, string> = {
  mistral: '/assets/mistral.png',
  mistralai: '/assets/mistral.png',
  cohere: '/assets/cohere.png',
  perplexity: '/assets/perplexity.png',
  groq: '/assets/groq.png',
  anyscale: '/assets/anyscale.png',
  fireworks: '/assets/fireworks.png',
  openrouter: '/assets/openrouter.png',
};

// Letter icon colors for fallback
const PROVIDER_COLORS: Record<string, string> = {
  'meta-llama': 'bg-gradient-to-br from-blue-500 to-blue-700',
  'meta': 'bg-gradient-to-br from-blue-500 to-blue-700',
  'deepseek': 'bg-gradient-to-br from-indigo-500 to-indigo-600',
  'qwen': 'bg-gradient-to-br from-violet-500 to-violet-600',
  'alibaba': 'bg-gradient-to-br from-orange-600 to-orange-700',
  'x-ai': 'bg-gradient-to-br from-gray-700 to-gray-900',
  'xai': 'bg-gradient-to-br from-gray-700 to-gray-900',
  'nvidia': 'bg-gradient-to-br from-green-600 to-green-700',
  'ai21': 'bg-gradient-to-br from-cyan-500 to-cyan-600',
  'bytedance': 'bg-gradient-to-br from-red-500 to-pink-600',
  'baidu': 'bg-gradient-to-br from-blue-600 to-blue-800',
  'amazon': 'bg-gradient-to-br from-orange-500 to-orange-700',
  'tencent': 'bg-gradient-to-br from-blue-500 to-green-500',
  'huggingface': 'bg-gradient-to-br from-yellow-500 to-yellow-600',
  'default': 'bg-gradient-to-br from-gray-500 to-gray-700',
};

// Provider letter mapping for fallback
const PROVIDER_LETTERS: Record<string, string> = {
  'meta-llama': 'Ll',
  'meta': 'Ll',
  'moonshotai': 'K',
  'moonshot': 'K',
  'x-ai': 'X',
  'xai': 'X',
  '01-ai': '01',
  'huggingface': '🤗',
  'thudm': 'G', // ChatGLM
};

interface DynamicProviderIconProps {
  provider: string;
  size?: number;
  className?: string;
}

// Letter icon fallback component
const ProviderLetterIcon: React.FC<{ provider: string; size?: number }> = ({
  provider,
  size = 20
}) => {
  const letter = PROVIDER_LETTERS[provider] ||
    provider.charAt(0).toUpperCase();
  const color = PROVIDER_COLORS[provider] || PROVIDER_COLORS.default;

  return (
    <div
      className={`flex items-center justify-center rounded text-xs font-bold text-white ${color}`}
      style={{ width: size, height: size }}
    >
      {letter}
    </div>
  );
};

// Main dynamic provider icon component
export const DynamicProviderIcon: React.FC<DynamicProviderIconProps> = memo(({
  provider,
  size = 20,
  className = 'h-5 w-5 object-contain'
}) => {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadIcon = async () => {
      // Normalize provider name
      const normalizedProvider = provider.toLowerCase();

      // Check cache first
      if (iconCache.has(normalizedProvider)) {
        const cached = iconCache.get(normalizedProvider);
        if (mounted) {
          setIconUrl(cached);
          setLoading(false);
        }
        return;
      }

      // Check local assets
      if (LOCAL_ASSETS[normalizedProvider]) {
        const localUrl = LOCAL_ASSETS[normalizedProvider];
        iconCache.set(normalizedProvider, localUrl);
        if (mounted) {
          setIconUrl(localUrl);
          setLoading(false);
        }
        return;
      }

      // Try LobeHub CDN
      try {
        // Try SVG first
        const svgUrl = `https://icons.lobehub.com/${normalizedProvider}.svg`;
        const svgResponse = await fetch(svgUrl, {
          method: 'HEAD',
          mode: 'cors',
        });

        if (svgResponse.ok) {
          iconCache.set(normalizedProvider, svgUrl);
          if (mounted) {
            setIconUrl(svgUrl);
            setLoading(false);
          }
          return;
        }

        // Try PNG as fallback
        const pngUrl = `https://icons.lobehub.com/${normalizedProvider}.png`;
        const pngResponse = await fetch(pngUrl, {
          method: 'HEAD',
          mode: 'cors',
        });

        if (pngResponse.ok) {
          iconCache.set(normalizedProvider, pngUrl);
          if (mounted) {
            setIconUrl(pngUrl);
            setLoading(false);
          }
          return;
        }
      } catch (err) {
        console.debug(`Failed to load icon for ${normalizedProvider}:`, err);
      }

      // No icon found, cache as null
      iconCache.set(normalizedProvider, null);
      if (mounted) {
        setError(true);
        setLoading(false);
      }
    };

    loadIcon();

    return () => {
      mounted = false;
    };
  }, [provider]);

  // Loading state
  if (loading) {
    return (
      <div
        className={`animate-pulse bg-gray-300 dark:bg-gray-600 rounded`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Successfully loaded icon
  if (iconUrl && !error) {
    return (
      <img
        src={iconUrl}
        alt={provider}
        className={className}
        onError={() => {
          setError(true);
          // Remove from cache on error to allow retry on next render
          iconCache.delete(provider.toLowerCase());
        }}
        style={{ width: size, height: size }}
      />
    );
  }

  // Fallback to letter icon
  return <ProviderLetterIcon provider={provider} size={size} />;
});

DynamicProviderIcon.displayName = 'DynamicProviderIcon';

// Export a function to clear the cache if needed
export const clearIconCache = () => {
  iconCache.clear();
};

// Export a function to preload icons for better performance
export const preloadProviderIcons = async (providers: string[]) => {
  const promises = providers.map(async (provider) => {
    const normalizedProvider = provider.toLowerCase();

    // Skip if already cached
    if (iconCache.has(normalizedProvider)) {
      return;
    }

    // Check local assets first
    if (LOCAL_ASSETS[normalizedProvider]) {
      iconCache.set(normalizedProvider, LOCAL_ASSETS[normalizedProvider]);
      return;
    }

    // Try CDN
    try {
      const svgUrl = `https://icons.lobehub.com/${normalizedProvider}.svg`;
      const response = await fetch(svgUrl, { method: 'HEAD', mode: 'cors' });

      if (response.ok) {
        iconCache.set(normalizedProvider, svgUrl);
      } else {
        iconCache.set(normalizedProvider, null);
      }
    } catch {
      iconCache.set(normalizedProvider, null);
    }
  });

  await Promise.all(promises);
};

export default DynamicProviderIcon;