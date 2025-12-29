import { useRecoilValue } from 'recoil';
import store from '~/store';

type LocalizedValue = string | Record<string, string> | undefined;

/**
 * Hook to resolve localized config values based on current user language.
 * Automatically retrieves the current language from Recoil state.
 *
 * @returns A function to resolve localized values
 */
export default function useLocalizedConfig() {
  const lang = useRecoilValue(store.lang);

  /**
   * Resolves a localized config value.
   * @param value - Either a string or object with language codes as keys
   * @param fallback - Fallback value if config is undefined or language not found
   * @returns The resolved string value
   */
  return (value: LocalizedValue, fallback: string): string => {
    if (value === undefined) {
      return fallback;
    }
    if (typeof value === 'string') {
      return value;
    }
    // Extract base language code (e.g., 'de' from 'de-DE')
    const baseLang = lang?.split('-')[0] ?? 'en';

    // Try exact locale (de-DE), then base language (de), then 'en', then first available
    return (
      (lang && value[lang]) || value[baseLang] || value['en'] || Object.values(value)[0] || fallback
    );
  };
}
