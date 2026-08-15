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

const UI_RESOURCE_PATTERN = /\\ui\{[\w]+(?:,[\w]+)*\}/g;

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
  const chunks: string[] = [];
  let copyStart = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const backtick = text.indexOf('`', cursor);
    const marker = text.indexOf('\\ui{', cursor);
    if (marker !== -1 && (backtick === -1 || marker < backtick)) {
      UI_RESOURCE_PATTERN.lastIndex = marker;
      const match = UI_RESOURCE_PATTERN.exec(text);
      if (match?.index === marker) {
        chunks.push(text.slice(copyStart, marker));
        cursor = marker + match[0].length;
        copyStart = cursor;
      } else {
        cursor = marker + 4;
      }
      continue;
    }
    if (backtick === -1) {
      break;
    }

    let openerEnd = backtick;
    while (text[openerEnd] === '`') {
      openerEnd++;
    }
    const closerEnd = findClosingBackticks(text, openerEnd, openerEnd - backtick);
    cursor = closerEnd === -1 ? openerEnd : closerEnd;
  }
  return chunks.length === 0 ? text : chunks.join('') + text.slice(copyStart);
}

type MarkdownContainers = {
  blockquoteDepth: number;
  content: string;
  contentAfterBlockquotes: string;
  listIndent: number;
};

function parseMarkdownContainers(line: string): MarkdownContainers {
  let content = line;
  let blockquoteDepth = 0;
  while (true) {
    const blockquote = content.match(/^ {0,3}>[ \t]?/)?.[0];
    if (!blockquote) {
      break;
    }
    blockquoteDepth++;
    content = content.slice(blockquote.length);
  }

  const contentAfterBlockquotes = content;
  let listIndent = 0;
  while (true) {
    const listItem = content.match(/^ {0,3}(?:[*+-]|\d{1,9}[.)])[ \t]+/)?.[0];
    if (!listItem) {
      break;
    }
    listIndent += listItem.length;
    content = content.slice(listItem.length);
  }
  return { blockquoteDepth, content, contentAfterBlockquotes, listIndent };
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

type MarkdownFence = {
  character: '`' | '~';
  length: number;
  blockquoteDepth: number;
  listIndent: number;
};

function closesFence(line: string, fence: MarkdownFence): boolean {
  const indent = line.match(/^ {0,3}/)?.[0].length ?? 0;
  let end = indent;
  while (line[end] === fence.character) {
    end++;
  }
  return end - indent >= fence.length && line.slice(end).trim() === '';
}

function remainsInFenceContainer(containers: MarkdownContainers, fence: MarkdownFence): boolean {
  if (containers.blockquoteDepth < fence.blockquoteDepth) {
    return false;
  }
  if (fence.listIndent === 0 || containers.contentAfterBlockquotes.trim() === '') {
    return true;
  }
  const continuationIndent = containers.contentAfterBlockquotes.match(/^[ \t]*/)?.[0].length ?? 0;
  return continuationIndent >= fence.listIndent;
}

/** Remove renderable MCP-UI markers without altering literal Markdown code examples. */
export function stripUIResourceMarkers(text: string): string;
export function stripUIResourceMarkers(text: undefined): undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined;
export function stripUIResourceMarkers(text: string | undefined): string | undefined {
  if (text == null || !text.includes('\\ui{')) {
    return text;
  }

  const lines = text.match(/[^\n]*(?:\n|$)/g) ?? [];
  let result = '';
  let markdown = '';
  let fence: MarkdownFence | null = null;
  const flushMarkdown = () => {
    result += stripMarkersOutsideInlineCode(markdown);
    markdown = '';
  };

  for (const line of lines) {
    const content = line.endsWith('\n') ? line.slice(0, -1) : line;
    const containers = parseMarkdownContainers(content);
    if (fence && remainsInFenceContainer(containers, fence)) {
      flushMarkdown();
      result += line;
      if (closesFence(containers.content, fence)) {
        fence = null;
      }
      continue;
    }
    fence = null;

    const openingFence = getFence(containers.content);
    if (openingFence || /^(?: {4}|\t)/.test(containers.content)) {
      flushMarkdown();
      result += line;
      fence = openingFence
        ? {
            ...openingFence,
            blockquoteDepth: containers.blockquoteDepth,
            listIndent: containers.listIndent,
          }
        : null;
      continue;
    }
    markdown += line;
  }
  flushMarkdown();
  return result;
}

/** Sanitize string and TextData object representations while preserving annotations. */
export function stripUIResourceMarkersFromTextPart(part: unknown): unknown {
  if (part == null || typeof part !== 'object') {
    return part;
  }
  const record = part as Record<string, unknown>;
  if (typeof record.text === 'string') {
    const text = stripUIResourceMarkers(record.text);
    return text === record.text ? part : { ...record, text };
  }
  if (record.text != null && typeof record.text === 'object') {
    const textData = record.text as Record<string, unknown>;
    if (typeof textData.value === 'string') {
      const value = stripUIResourceMarkers(textData.value);
      return value === textData.value ? part : { ...record, text: { ...textData, value } };
    }
  }
  return part;
}
