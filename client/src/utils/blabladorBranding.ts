export const BLABLADOR_CUSTOM_FOOTER =
  'Made with ❤️ by Jülich Supercomputing Centre|' +
  'Get in touch with us at [support@hifis.net](mailto:support@hifis.net?subject=%5Bblablador%5D).|' +
  '[API access (see documentation)](https://sdlaml.pages.jsc.fz-juelich.de/ai/guides/blablador_api_access/) is available too!|' +
  'You can also subscribe to our [blablador-news mailing list](https://lists.fz-juelich.de/postorius/lists/blablador-news.lists.fz-juelich.de/)!';

export const BLABLADOR_OPENID_IMAGE = '/assets/blablador-ng-notext.svg';
export const BLABLADOR_DISCLAIMER =
  'Remember: I am a BLABLADOR! Not all I say is true or even real. All output here is AI-Generated';

export function stripWrappingQuotes(value?: string | null) {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function getBlabladorCustomFooter(appTitle?: string | null, customFooter?: string | null) {
  const normalizedTitle = stripWrappingQuotes(appTitle)?.toLowerCase();
  if (normalizedTitle === 'blablador') {
    return BLABLADOR_CUSTOM_FOOTER;
  }

  const normalizedFooter = stripWrappingQuotes(customFooter);
  return typeof normalizedFooter === 'string' ? normalizedFooter : null;
}
