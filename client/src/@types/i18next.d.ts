import { defaultNS, resources } from '~/locales/i18n';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: typeof resources.en;
    strictKeyChecks: true;
  }
}
