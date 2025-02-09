import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import your JSON translations
import translationEn from './en/translation.json';
import translationAr from './ar/translation.json';
import translationZh from './zh/translation.json';
import translationDe from './de/translation.json';
import translationEs from './es/translation.json';
import translationFr from './fr/translation.json';
import translationIt from './it/translation.json';
import translationPl from './pl/translation.json';
import translationPt from './pt/translation.json';
import translationRu from './ru/translation.json';
import translationJa from './ja/translation.json';
import translationSv from './sv/translation.json';
import translationKo from './ko/translation.json';
import translationZh_Hant from './zh-Hant/translation.json';
import translationVi from './vi/translation.json';
import translationTr from './tr/translation.json';
import translationNl from './nl/translation.json';
import translationId from './id/translation.json';
import translationHe from './he/translation.json';
import translationFi from './fi/translation.json';

export const defaultNS = 'translation';

export const resources = {
  en: { translation: translationEn },
  ar: { translation: translationAr },
  zh: { translation: translationZh },
  de: { translation: translationDe },
  es: { translation: translationEs },
  fr: { translation: translationFr },
  it: { translation: translationIt },
  pl: { translation: translationPl },
  pt: { translation: translationPt },
  ru: { translation: translationRu },
  ja: { translation: translationJa },
  sv: { translation: translationSv },
  ko: { translation: translationKo },
  'zh-Hant': { translation: translationZh_Hant },
  vi: { translation: translationVi },
  tr: { translation: translationTr },
  nl: { translation: translationNl },
  id: { translation: translationId },
  he: { translation: translationHe },
  fi: { translation: translationFi },
} as const;

i18n
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    ns: ['translation'],
    defaultNS,
    resources,
    interpolation: { escapeValue: false },
    // Return an empty string for missing keys rather than the key itself
    parseMissingKeyHandler: () => '',
  });

export default i18n;