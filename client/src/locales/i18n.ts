import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Only PT-BR + EN fallback for Bizu
import translationEn from './en/translation.json';
import translationPt_BR from './pt-BR/translation.json';

export const defaultNS = 'translation';

export const resources = {
  en: { translation: translationEn },
  'pt-BR': { translation: translationPt_BR },
} as const;

i18n
  .use(initReactI18next)
  .init({
    lng: 'pt-BR',
    fallbackLng: 'en',
    fallbackNS: 'translation',
    ns: ['translation'],
    debug: false,
    defaultNS,
    resources,
    interpolation: { escapeValue: false },
  });

export default i18n;
