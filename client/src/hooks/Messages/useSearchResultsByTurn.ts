import { useMemo } from 'react';
import { TAttachment, Tools, SearchResultData } from 'librechat-data-provider';

/**
 * Hook that creates a map of turn numbers to SearchResultData from web search attachments
 * @param attachments Array of attachment metadata
 * @returns A map of turn numbers to their corresponding search result data
 */
export function useSearchResultsByTurn(attachments?: TAttachment[]) {
  const searchResultsByTurn = useMemo(() => {
    const turnMap: { [key: string]: SearchResultData } = {};

    attachments?.forEach((attachment) => {
      if (attachment.type === Tools.web_search && attachment[Tools.web_search]) {
        const searchData = attachment[Tools.web_search];
        if (searchData && typeof searchData.turn === 'number') {
          turnMap[searchData.turn.toString()] = searchData;
        }
      }
    });

    return turnMap;
  }, [attachments]);

  return searchResultsByTurn;
}
