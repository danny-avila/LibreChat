import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import translationPt_BR from './pt-BR/translation.json';

export const defaultNS = 'translation';

export const resources = {
  'pt-BR': { translation: translationPt_BR },
} as const;

i18n.use(initReactI18next).init({
  // Single-language app (PT-BR only) to simplify Bizu UX and copies
  fallbackLng: 'pt-BR',
  supportedLngs: ['pt-BR'],
  fallbackNS: 'translation',
  ns: ['translation'],
  debug: false,
  defaultNS,
  resources,
  interpolation: { escapeValue: false },
});

export default i18n;
