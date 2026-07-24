import type { SearchResultData } from 'librechat-data-provider';
import type {
  ChatGptMessage,
  ImportedCitations,
  ChatGptSearchEntry,
  ChatGptContentReference,
} from '~/import/types';

const ANCHOR_PATTERN = /turn(\d+)(search|image|news|video|ref|file)(\d+)/g;

interface SourceBuckets {
  organic: SearchResultData['organic'];
  topStories: SearchResultData['topStories'];
  images: SearchResultData['images'];
  references: SearchResultData['references'];
}

function toSource(entry: ChatGptSearchEntry, domain: string | null) {
  return {
    link: entry.url ?? '',
    title: entry.title ?? undefined,
    snippet: entry.snippet ?? undefined,
    attribution: entry.attributions ?? domain ?? undefined,
  };
}

function fromReference(reference: ChatGptContentReference) {
  return {
    link: reference.url ?? '',
    title: reference.title ?? undefined,
    snippet: reference.snippet ?? undefined,
    attribution: reference.attribution ?? undefined,
  };
}

function collectWebSources(message: ChatGptMessage) {
  const sources: ReturnType<typeof toSource>[] = [];

  for (const group of message.metadata?.search_result_groups ?? []) {
    for (const entry of group.entries) {
      sources.push(toSource(entry, group.domain));
    }
  }

  for (const reference of message.metadata?.content_references ?? []) {
    if (reference.type === 'webpage' || reference.type === 'webpage_extended') {
      sources.push(fromReference(reference));
      continue;
    }
    for (const item of reference.items ?? reference.sources ?? []) {
      sources.push(toSource(item, null));
    }
  }

  return sources.filter((source) => source.link.length > 0);
}

function collectFileSources(message: ChatGptMessage) {
  const references = [];
  for (const reference of message.metadata?.content_references ?? []) {
    if (reference.type !== 'file' || !reference.id) {
      continue;
    }
    const name = reference.name ?? reference.title ?? reference.id;
    references.push({
      link: `#file-${reference.id}`,
      title: name,
      attribution: name,
      snippet: reference.snippet ?? undefined,
      type: 'file' as const,
    });
  }
  return references;
}

function collectImageSources(message: ChatGptMessage) {
  const images = [];
  for (const entry of message.metadata?.image_results ?? []) {
    if (entry.url) {
      images.push({ link: entry.url, title: entry.title ?? undefined });
    }
  }
  return images;
}

/**
 * Anchors already present in the exported text use LibreChat's own citation
 * format, so only the per-turn source payload has to be reconstructed. Turns
 * with no resolvable source are omitted; the client strips their anchors.
 */
export function buildCitations(message: ChatGptMessage, text: string): ImportedCitations[] {
  ANCHOR_PATTERN.lastIndex = 0;
  const turns = new Map<number, Set<string>>();

  let match: RegExpExecArray | null;
  while ((match = ANCHOR_PATTERN.exec(text)) !== null) {
    const turn = Number(match[1]);
    const existing = turns.get(turn);
    if (existing) {
      existing.add(match[2]);
      continue;
    }
    turns.set(turn, new Set([match[2]]));
  }

  if (turns.size === 0) {
    return [];
  }

  const web = collectWebSources(message);
  const files = collectFileSources(message);
  const images = collectImageSources(message);

  const results: ImportedCitations[] = [];
  for (const [turn, types] of turns) {
    const buckets: Partial<SourceBuckets> = {};

    if (types.has('search') && web.length > 0) {
      buckets.organic = web;
    }
    if (types.has('news') && web.length > 0) {
      buckets.topStories = web;
    }
    if (types.has('image') && images.length > 0) {
      buckets.images = images;
    }
    if ((types.has('file') || types.has('ref')) && files.length > 0) {
      buckets.references = files;
    }

    if (Object.keys(buckets).length === 0) {
      continue;
    }

    results.push({ turn, data: { turn, ...buckets } });
  }

  return results;
}
