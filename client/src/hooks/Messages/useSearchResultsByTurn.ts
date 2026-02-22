import { useMemo } from 'react';
import { TAttachment, Tools, SearchResultData } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

interface FileSource {
  fileId: string;
  fileName: string;
  pages?: number[];
  relevance?: number;
  pageRelevance?: Record<string, number>;
  metadata?: any;
}

interface DeduplicatedSource {
  fileId: string;
  fileName: string;
  pages: number[];
  relevance: number;
  pageRelevance: Record<string, number>;
  metadata?: any;
}

/**
 * Hook that creates a map of turn numbers to SearchResultData from web search and agent file search attachments
 * @param attachments Array of attachment metadata
 * @returns A map of turn numbers to their corresponding search result data
 */
export function useSearchResultsByTurn(attachments?: TAttachment[]) {
  const localize = useLocalize();
  const searchResultsByTurn = useMemo(() => {
    const turnMap: { [key: string]: SearchResultData } = {};
    let agentFileSearchTurn = 0;

    attachments?.forEach((attachment) => {
      // Handle web search attachments (existing functionality)
      if (attachment.type === Tools.web_search && attachment[Tools.web_search]) {
        const searchData = attachment[Tools.web_search];
        if (searchData && typeof searchData.turn === 'number') {
          turnMap[searchData.turn.toString()] = searchData;
        }
      }

      // Handle agent file search attachments (following web search pattern)
      if (attachment.type === Tools.file_search && attachment[Tools.file_search]) {
        const sources = attachment[Tools.file_search].sources;

        // Deduplicate sources by fileId and merge pages
        const deduplicatedSources = new Map<string, DeduplicatedSource>();

        sources.forEach((source: FileSource) => {
          const fileId = source.fileId;
          if (deduplicatedSources.has(fileId)) {
            // Merge pages for the same file
            const existing = deduplicatedSources.get(fileId);
            if (existing) {
              const existingPages = existing.pages || [];
              const newPages = source.pages || [];
              const allPages = [...existingPages, ...newPages];
              // Remove duplicates and sort
              const uniquePages = [...new Set(allPages)].sort((a, b) => a - b);

              // Merge page relevance mappings
              const existingPageRelevance = existing.pageRelevance || {};
              const newPageRelevance = source.pageRelevance || {};
              const mergedPageRelevance = { ...existingPageRelevance, ...newPageRelevance };

              existing.pages = uniquePages;
              existing.relevance = Math.max(existing.relevance || 0, source.relevance || 0);
              existing.pageRelevance = mergedPageRelevance;
            }
          } else {
            deduplicatedSources.set(fileId, {
              fileId: source.fileId,
              fileName: source.fileName,
              pages: source.pages || [],
              relevance: source.relevance || 0.5,
              pageRelevance: source.pageRelevance || {},
              metadata: source.metadata,
            });
          }
        });

        // Convert agent file sources to SearchResultData format
        const agentSearchData: SearchResultData = {
          turn: agentFileSearchTurn,
          organic: [], // Agent file search doesn't have organic web results
          topStories: [], // No top stories for file search
          images: [], // No images for file search
          references: Array.from(deduplicatedSources.values()).map(
            (source) =>
              ({
                title: source.fileName || localize('com_file_unknown'),
                link: `#file-${source.fileId}`, // Create a pseudo-link for file references
                attribution: source.fileName || localize('com_file_unknown'), // Show filename in inline display
                snippet:
                  source.pages && source.pages.length > 0
                    ? localize('com_file_pages', { pages: source.pages.join(', ') })
                    : '', // Only page numbers for hover
                type: 'file' as const,
                // Store additional agent-specific data as properties on the reference
                fileId: source.fileId,
                fileName: source.fileName,
                pages: source.pages,
                pageRelevance: source.pageRelevance,
                metadata: source.metadata,
              }) as any,
          ),
        };

        turnMap[agentFileSearchTurn.toString()] = agentSearchData;
        agentFileSearchTurn++;
      }
    });

    return turnMap;
  }, [attachments, localize]);

  return searchResultsByTurn;
}
