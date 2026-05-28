import { useEffect } from 'react';
import posthog from 'posthog-js';

const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const PC_PREFIX = 'pc_';
const STORAGE_KEY = 'codecan_seo_attribution';

export default function useSeoAttribution() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const attribution: Record<string, string> = {};

    for (const key of UTM_PARAMS) {
      const val = params.get(key);
      if (val) {
        attribution[key] = val;
      }
    }
    for (const [key, val] of params.entries()) {
      if (key.startsWith(PC_PREFIX)) {
        attribution[key] = val;
      }
    }

    if (Object.keys(attribution).length === 0) {
      return;
    }

    attribution.landing_referrer_host = document.referrer
      ? new URL(document.referrer).hostname
      : '';
    attribution.landing_path = window.location.pathname;
    attribution.landing_captured_at = new Date().toISOString();

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
    } catch {
      // localStorage unavailable — skip silently
    }

    // Strip attribution params from the URL without a navigation
    const stripped = new URLSearchParams(params);
    for (const key of UTM_PARAMS) {
      stripped.delete(key);
    }
    for (const key of [...stripped.keys()]) {
      if (key.startsWith(PC_PREFIX)) {
        stripped.delete(key);
      }
    }
    const newSearch = stripped.toString();
    const newUrl =
      window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState(null, '', newUrl);

    posthog.capture('seo_attribution_captured', attribution);

    // Register as super-properties so every subsequent event carries them
    posthog.register(attribution);
  }, []); // run once on mount
}
