import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import your JSON translations — Ground Zero supports EN, FR, DE, AR
import translationEn from './en/translation.json';
import translationAr from './ar/translation.json';
import translationDe from './de/translation.json';
import translationFr from './fr/translation.json';

export const defaultNS = 'translation';

export const resources = {
  en: { translation: translationEn },
  ar: { translation: translationAr },
  de: { translation: translationDe },
  fr: { translation: translationFr },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: {
      default: ['en'],
    },
    fallbackNS: 'translation',
    ns: ['translation'],
    debug: false,
    defaultNS,
    resources,
    interpolation: { escapeValue: false },
  });

export default i18n;
