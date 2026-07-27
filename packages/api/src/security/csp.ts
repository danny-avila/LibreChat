import { randomBytes } from 'crypto';
import { logger } from '@librechat/data-schemas';

import { isEnabled } from '../utils';

/** Split point for the per-request nonce. Randomized so no env value can collide. */
const NONCE_SLOT = `__csp_nonce_${randomBytes(8).toString('hex')}__`;

const DIRECTIVE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const SCRIPT_TAG_PATTERN = /<script\b([^>]*)>/gi;
const NONCE_ATTRIBUTE_PATTERN = /\snonce\s*=/i;

type CspDirective = [string, string[]];

/** Precomputed once at startup; only the nonce varies per response. */
export interface CspPolicy {
  headerName: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only';
  prefix: string;
  suffix: string;
}

export interface CspResponse {
  headerName: CspPolicy['headerName'];
  headerValue: string;
  nonce: string;
}

const SOURCE_EXTRA_ENV: Record<string, string> = {
  'default-src': 'CSP_DEFAULT_SRC_EXTRA',
  'script-src': 'CSP_SCRIPT_SRC_EXTRA',
  'style-src': 'CSP_STYLE_SRC_EXTRA',
  'img-src': 'CSP_IMG_SRC_EXTRA',
  'font-src': 'CSP_FONT_SRC_EXTRA',
  'connect-src': 'CSP_CONNECT_SRC_EXTRA',
  'media-src': 'CSP_MEDIA_SRC_EXTRA',
  'frame-src': 'CSP_FRAME_SRC_EXTRA',
  'worker-src': 'CSP_WORKER_SRC_EXTRA',
  'form-action': 'CSP_FORM_ACTION_EXTRA',
};

function splitSourceList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[,\s]+/)
    .map((source) => source.trim())
    .filter(Boolean);
}

function isReportOnly(env: NodeJS.ProcessEnv): boolean {
  const value = env.CSP_REPORT_ONLY;
  if (value == null || value.trim() === '') {
    return true;
  }
  return isEnabled(value);
}

/**
 * `'strict-dynamic'` makes browsers ignore every host source in `script-src`, so it
 * cannot coexist with operator-supplied script hosts. When extras are configured we
 * drop it and let the (now honored) `'self'` plus those hosts govern script loading.
 */
function scriptSources(scriptExtras: string[]): string[] {
  if (scriptExtras.length === 0) {
    return [`'nonce-${NONCE_SLOT}'`, "'strict-dynamic'", "'self'"];
  }
  logger.info(
    "[CSP] CSP_SCRIPT_SRC_EXTRA is set; omitting 'strict-dynamic' so the configured script hosts take effect.",
  );
  return [`'nonce-${NONCE_SLOT}'`, "'self'"];
}

/**
 * Styles intentionally carry no nonce. A nonce in `style-src` makes browsers ignore
 * `'unsafe-inline'`, which would block every `<style>` element injected at runtime by
 * the app shell and by third-party components that cannot know our nonce.
 */
function defaultDirectives(scriptExtras: string[], frameAncestors: string[]): CspDirective[] {
  return [
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['script-src', scriptSources(scriptExtras)],
    ['script-src-attr', ["'none'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", 'https:', 'wss:']],
    ['media-src', ["'self'", 'data:', 'blob:']],
    ['frame-src', ["'self'", 'https:', 'blob:', 'data:', 'about:']],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['form-action', ["'self'", 'https:']],
    /* Replaced wholesale, not appended: merging would turn a deliberate
     * `'none'` into `'self' 'none'`, which browsers resolve back to `'self'`. */
    ['frame-ancestors', frameAncestors],
  ];
}

function parseAdditionalDirectives(value: string | undefined): CspDirective[] {
  if (!value) {
    return [];
  }

  const directives: CspDirective[] = [];
  for (const directive of value.split(';')) {
    const trimmed = directive.trim();
    if (!trimmed) {
      continue;
    }

    const [name, ...sources] = trimmed.split(/\s+/);
    if (!DIRECTIVE_NAME_PATTERN.test(name)) {
      logger.warn(`[CSP] Ignoring invalid directive name "${name}" in CSP_ADDITIONAL_DIRECTIVES.`);
      continue;
    }

    directives.push([name, sources]);
  }

  return directives;
}

function mergeDirectives(directives: CspDirective[]): CspDirective[] {
  const order: string[] = [];
  const merged = new Map<string, string[]>();

  for (const [name, values] of directives) {
    let current = merged.get(name);
    if (!current) {
      current = [];
      order.push(name);
      merged.set(name, current);
    }

    for (const value of values) {
      if (!current.includes(value)) {
        current.push(value);
      }
    }
  }

  return order.map((name) => [name, merged.get(name) ?? []]);
}

export function buildCspDirectives(env: NodeJS.ProcessEnv = process.env): CspDirective[] {
  const scriptExtras = splitSourceList(env.CSP_SCRIPT_SRC_EXTRA);
  const frameAncestors = splitSourceList(env.CSP_FRAME_ANCESTORS);
  const directives = defaultDirectives(
    scriptExtras,
    frameAncestors.length > 0 ? frameAncestors : ["'self'"],
  );

  for (const [directive, envName] of Object.entries(SOURCE_EXTRA_ENV)) {
    const extraSources = splitSourceList(env[envName]);
    if (extraSources.length > 0) {
      directives.push([directive, extraSources]);
    }
  }

  const reportUri = env.CSP_REPORT_URI?.trim();
  if (reportUri) {
    directives.push(['report-uri', [reportUri]]);
  }

  return mergeDirectives([
    ...directives,
    ...parseAdditionalDirectives(env.CSP_ADDITIONAL_DIRECTIVES),
  ]);
}

export function serializeCspDirectives(directives: CspDirective[]): string {
  return directives
    .map(([name, values]) => (values.length > 0 ? `${name} ${values.join(' ')}` : name))
    .join('; ');
}

/**
 * Resolves the policy once at startup. Returns `null` unless `CSP_ENABLED` is set,
 * so existing deployments are unaffected until they opt in.
 */
export function createCspPolicy(env: NodeJS.ProcessEnv = process.env): CspPolicy | null {
  if (!isEnabled(env.CSP_ENABLED)) {
    return null;
  }

  const serialized = serializeCspDirectives(buildCspDirectives(env));
  const [prefix, suffix] = serialized.split(NONCE_SLOT);
  if (suffix == null) {
    logger.error(
      '[CSP] Policy has no nonce slot; refusing to send a policy the shell cannot match.',
    );
    return null;
  }

  const reportOnly = isReportOnly(env);
  logger.info(
    `[CSP] Content Security Policy enabled in ${reportOnly ? 'report-only' : 'enforcing'} mode.`,
  );

  return {
    headerName: reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    prefix,
    suffix,
  };
}

/** Mints the per-response nonce and its header value. */
export function issueCsp(policy: CspPolicy): CspResponse {
  const nonce = randomBytes(16).toString('base64');
  return {
    headerName: policy.headerName,
    headerValue: `${policy.prefix}${nonce}${policy.suffix}`,
    nonce,
  };
}

/**
 * Stamps the nonce onto every `<script>` element in the SPA shell. Styles are left
 * alone; see `defaultDirectives` for why they stay on `'unsafe-inline'`.
 */
export function applyCspNonce(html: string, nonce: string): string {
  if (!nonce) {
    return html;
  }

  return html.replace(SCRIPT_TAG_PATTERN, (match, attributes: string) => {
    if (NONCE_ATTRIBUTE_PATTERN.test(attributes)) {
      return match;
    }
    return `<script nonce="${nonce}"${attributes}>`;
  });
}
