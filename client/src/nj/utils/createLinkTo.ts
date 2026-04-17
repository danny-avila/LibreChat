import { To } from 'react-router-dom';

const OUR_DOMAINS = new Set(['localhost', 'dev.ai-assistant.nj.gov', 'ai-assistant.nj.gov']);

/**
 * If the URL is relative to one of our domains, then it creates a relative link.
 *
 * Otherwise, it returns the URL unchanged (so it can be opened to a new site).
 */
export function createLinkTo(url: string): To {
  try {
    const parsed = new URL(url);
    if (OUR_DOMAINS.has(parsed.hostname)) {
      return { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash };
    }
  } catch {
    // url is already relative
    return url;
  }
  return url;
}
