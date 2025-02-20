import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import your JSON translations
import translationEn from './en/translation.json';
import translationAr from './ar/translation.json';
import translationDe from './de/translation.json';
import translationEs from './es/translation.json';
import translationEt from './et/translation.json';
import translationFr from './fr/translation.json';
import translationIt from './it/translation.json';
import translationPl from './pl/translation.json';
import translationPt_BR from './pt-BR/translation.json';
import translationPt_PT from './pt-PT/translation.json';
import translationRu from './ru/translation.json';
import translationJa from './ja/translation.json';
import translationSv from './sv/translation.json';
import translationKo from './ko/translation.json';
import translationVi from './vi/translation.json';
import translationTr from './tr/translation.json';
import translationNl from './nl/translation.json';
import translationId from './id/translation.json';
import translationHe from './he/translation.json';
import translationFi from './fi/translation.json';
import translationZh_Hans from './zh-Hans/translation.json';
import translationZh_Hant from './zh-Hant/translation.json';

export const defaultNS = 'translation';

export const resources = {
  en: { translation: translationEn },
  ar: { translation: translationAr },
  'zh-Hans': { translation: translationZh_Hans },
  'zh-Hant': { translation: translationZh_Hant },
  de: { translation: translationDe },
  es: { translation: translationEs },
  et: { translation: translationEt },
  fr: { translation: translationFr },
  it: { translation: translationIt },
  pl: { translation: translationPl },
  'pt-BR': { translation: translationPt_BR },
  'pt-PT': { translation: translationPt_PT },
  ru: { translation: translationRu },
  ja: { translation: translationJa },
  sv: { translation: translationSv },
  ko: { translation: translationKo },
  vi: { translation: translationVi },
  tr: { translation: translationTr },
  nl: { translation: translationNl },
  id: { translation: translationId },
  he: { translation: translationHe },
  fi: { translation: translationFi },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: {
      'zh-TW': ['zh-Hant'],
      'zh-HK': ['zh-Hant'],
      'zh': ['zh-Hans'],
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