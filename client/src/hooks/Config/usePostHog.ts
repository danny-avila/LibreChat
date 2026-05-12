import { useEffect } from 'react';
import posthog from 'posthog-js';

let initialized = false;

export default function usePostHog(apiKey?: string, apiHost?: string) {
  useEffect(() => {
    if (!apiKey || initialized) {
      return;
    }
    posthog.init(apiKey, {
      api_host: apiHost || 'https://us.i.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      respect_dnt: true,
      persistence: 'localStorage+cookie',
    });
    initialized = true;
  }, [apiKey, apiHost]);
}
