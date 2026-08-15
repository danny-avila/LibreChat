export const envVarRegex = /^\${(.+)}$/;

/**
 * Infrastructure env vars that must never be resolved via placeholder expansion.
 * These are internal secrets whose exposure would compromise the system —
 * they have no legitimate reason to appear in outbound headers, MCP env/args, or OAuth config.
 *
 * Intentionally excludes API keys (operators reference them in config) and
 * OAuth/session secrets (referenced in MCP OAuth config via processMCPEnv).
 */
const SENSITIVE_ENV_VARS = new Set([
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CREDS_KEY',
  'CREDS_IV',
  'MEILI_MASTER_KEY',
  'MONGO_URI',
  'REDIS_URI',
  'REDIS_PASSWORD',
]);

/** Returns true when `varName` refers to an infrastructure secret that must not leak. */
export function isSensitiveEnvVar(varName: string): boolean {
  return SENSITIVE_ENV_VARS.has(varName);
}

/** Extracts the environment variable name from a template literal string */
export function extractVariableName(value: string): string | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(envVarRegex);
  return match ? match[1] : null;
}

/** Extracts the value of an environment variable from a string. */
export function extractEnvVariable(value: string) {
  if (!value) {
    return value;
  }

  const trimmed = value.trim();

  const singleMatch = trimmed.match(envVarRegex);
  if (singleMatch) {
    const varName = singleMatch[1];
    if (isSensitiveEnvVar(varName)) {
      return trimmed;
    }
    return process.env[varName] || trimmed;
  }

  const regex = /\${([^}]+)}/g;
  let result = trimmed;

  const matches = [];
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    matches.push({
      fullMatch: match[0],
      varName: match[1],
      index: match.index,
    });
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullMatch, varName, index } = matches[i];
    if (isSensitiveEnvVar(varName)) {
      continue;
    }
    const envValue = process.env[varName] || fullMatch;
    result = result.substring(0, index) + envValue + result.substring(index + fullMatch.length);
  }

  return result;
}

/**
 * Normalize the endpoint name to system-expected value.
 * @param name
 */
export function normalizeEndpointName(name = ''): string {
  return name.toLowerCase() === 'ollama' ? 'ollama' : name;
}

const UI_RESOURCE_AT_START = /^\\ui\{[\w]+(?:,[\w]+)*\}/;

function findClosingBackticks(text: string, start: number, length: number): number {
  let cursor = start;
  while (cursor < text.length) {
    const candidate = text.indexOf('`', cursor);
    if (candidate === -1) {
      return -1;
    }
    let end = candidate;
    while (text[end] === '`') {
      end++;
    }
    if (end - candidate === length) {
      return end;
    }
    cursor = end;
  }
  return -1;
}

function stripMarkersOutsideInlineCode(text: string): string {
  let result = '';
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] === '`') {
      let openerEnd = cursor;
      while (text[openerEnd] === '`') {
        openerEnd++;
      }
      const closerEnd = findClosingBackticks(text, openerEnd, openerEnd - cursor);
      if (closerEnd !== -1) {
        result += text.slice(cursor, closerEnd);
        cursor = closerEnd;
        continue;
      }
      result += text.slice(cursor, openerEnd);
      cursor = openerEnd;
      continue;
    }

    const marker = text.slice(cursor).match(UI_RESOURCE_AT_START)?.[0];
    if (marker) {
      cursor += marker.length;
      continue;
    }
    result += text[cursor++];
  }
  return result;
}

function stripMarkdownContainerPrefixes(line: string): string {
  let content = line;
  while (true) {
    const blockquote = content.match(/^ {0,3}>[ \t]?/)?.[0];
    if (blockquote) {
      content = content.slice(blockquote.length);
      continue;
    }
    const listItem = content.match(/^ {0,3}(?:[*+-]|\d{1,9}[.)])[ \t]+/)?.[0];
    if (listItem) {
      content = content.slice(listItem.length);
      continue;
    }
    return content;
  }
}

function getFence(line: string): { character: '`' | '~'; length: number } | null {
  const indent = line.match(/^ {0,3}/)?.[0].length ?? 0;
  const character = line[indent];
  if (character !== '`' && character !== '~') {
    return null;
  }
  let end = indent;
  while (line[end] === character) {
    end++;
  }
  return end - indent >= 3 ? { character, length: end - indent } : null;
}

function closesFence(line: string, fence: { character: '`' | '~'; length: number }): boolean {
  const indent = line.match(/^ {0,3}/)?.[0].length ?? 0;
  let end = indent;
  while (line[end] === fence.character) {
    end++;
  }
  return end - indent >= fence.length && line.slice(end).trim() === '';
}

/** Remove renderable MCP-UI markers without altering literal Markdown code examples. */
export function stripUIResourceMarkers(text: string): string;
export function stripUIResourceMarkers(text: undefined): undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined {
  if (text == null) {
    return text;
  }

  const lines = text.match(/[^\n]*(?:\n|$)/g) ?? [];
  let result = '';
  let markdown = '';
  let fence: { character: '`' | '~'; length: number } | null = null;
  const flushMarkdown = () => {
    result += stripMarkersOutsideInlineCode(markdown);
    markdown = '';
  };

  for (const line of lines) {
    const content = line.endsWith('\n') ? line.slice(0, -1) : line;
    const containerContent = stripMarkdownContainerPrefixes(content);
    if (fence) {
      flushMarkdown();
      result += line;
      if (closesFence(containerContent, fence)) {
        fence = null;
      }
      continue;
    }

    const openingFence = getFence(containerContent);
    if (openingFence || /^(?: {4}|\t)/.test(content)) {
      flushMarkdown();
      result += line;
      fence = openingFence;
      continue;
    }
    markdown += line;
  }
  flushMarkdown();
  return result;
}
