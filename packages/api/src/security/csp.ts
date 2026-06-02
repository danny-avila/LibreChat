import { randomBytes } from 'crypto';

import { isEnabled } from '../utils';

export interface CspHeader {
  nonce: string;
  headerName: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only';
  headerValue: string;
}

type CspDirective = [string, string[]];
type CspEnv = NodeJS.ProcessEnv;

const sourceExtraEnv: Record<string, string> = {
  'default-src': 'CSP_DEFAULT_SRC_EXTRA',
  'script-src': 'CSP_SCRIPT_SRC_EXTRA',
  'style-src': 'CSP_STYLE_SRC_EXTRA',
  'style-src-elem': 'CSP_STYLE_SRC_ELEM_EXTRA',
  'style-src-attr': 'CSP_STYLE_SRC_ATTR_EXTRA',
  'img-src': 'CSP_IMG_SRC_EXTRA',
  'font-src': 'CSP_FONT_SRC_EXTRA',
  'connect-src': 'CSP_CONNECT_SRC_EXTRA',
  'media-src': 'CSP_MEDIA_SRC_EXTRA',
  'frame-src': 'CSP_FRAME_SRC_EXTRA',
  'worker-src': 'CSP_WORKER_SRC_EXTRA',
  'form-action': 'CSP_FORM_ACTION_EXTRA',
};

const directiveNamePattern = /^[a-z][a-z0-9-]*$/;
const nonceTagPattern = /<(script|style)\b([^>]*)>/gi;
const nonceAttributePattern = /\snonce\s*=/i;

function isReportOnly(env: CspEnv): boolean {
  const value = env.CSP_REPORT_ONLY;
  if (value == null || value.trim() === '') {
    return true;
  }
  return isEnabled(value);
}

function splitSourceList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[,\s]+/)
    .map((source) => source.trim())
    .filter(Boolean);
}

function defaultDirectives(nonce: string): CspDirective[] {
  return [
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['script-src', [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'"]],
    ['script-src-attr', ["'none'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['style-src-elem', ["'self'", `'nonce-${nonce}'`, "'unsafe-inline'"]],
    ['style-src-attr', ["'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", 'https:', 'wss:']],
    ['media-src', ["'self'", 'data:', 'blob:']],
    ['frame-src', ["'self'", 'https:', 'blob:', 'data:', 'about:']],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['form-action', ["'self'", 'https:']],
  ];
}

function mergeDirectives(directives: CspDirective[]): CspDirective[] {
  const order: string[] = [];
  const merged = new Map<string, string[]>();

  for (const [name, values] of directives) {
    if (!merged.has(name)) {
      order.push(name);
      merged.set(name, []);
    }

    const current = merged.get(name);
    if (!current) {
      continue;
    }

    for (const value of values) {
      if (!current.includes(value)) {
        current.push(value);
      }
    }
  }

  return order.map((name) => [name, merged.get(name) ?? []]);
}

function additionalDirectives(value: string | undefined): CspDirective[] {
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
    if (!directiveNamePattern.test(name)) {
      continue;
    }

    directives.push([name, sources]);
  }

  return directives;
}

export function buildCspDirectives(nonce: string, env: CspEnv = process.env): CspDirective[] {
  const directives = defaultDirectives(nonce);

  for (const [directive, envName] of Object.entries(sourceExtraEnv)) {
    const extraSources = splitSourceList(env[envName]);
    if (extraSources.length > 0) {
      directives.push([directive, extraSources]);
    }
  }

  const frameAncestors = splitSourceList(env.CSP_FRAME_ANCESTORS);
  if (frameAncestors.length > 0) {
    directives.push(['frame-ancestors', frameAncestors]);
  }

  const reportUri = env.CSP_REPORT_URI?.trim();
  if (reportUri) {
    directives.push(['report-uri', [reportUri]]);
  }

  return mergeDirectives([...directives, ...additionalDirectives(env.CSP_ADDITIONAL_DIRECTIVES)]);
}

export function serializeCspDirectives(directives: CspDirective[]): string {
  return directives
    .map(([name, values]) => (values.length > 0 ? `${name} ${values.join(' ')}` : name))
    .join('; ');
}

export function createCspNonce(): string {
  return randomBytes(16).toString('base64');
}

export function createContentSecurityPolicy(env: CspEnv = process.env): CspHeader | null {
  if (!isEnabled(env.CSP_ENABLED)) {
    return null;
  }

  const nonce = createCspNonce();
  return {
    nonce,
    headerName: isReportOnly(env)
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy',
    headerValue: serializeCspDirectives(buildCspDirectives(nonce, env)),
  };
}

export function applyCspNonce(html: string, nonce: string): string {
  if (!nonce) {
    return html;
  }

  return html.replace(nonceTagPattern, (match, tag: string, attributes: string) => {
    if (nonceAttributePattern.test(attributes)) {
      return match;
    }
    return `<${tag} nonce="${nonce}"${attributes}>`;
  });
}
