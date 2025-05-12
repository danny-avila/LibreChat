import { createContext, useContext } from 'react';
import type * as t from './types';
import { useSearchContext } from '~/Providers';

export interface CitationContextType {
  hoveredCitationId: string | null;
  setHoveredCitationId: (id: string | null) => void;
}

export const CitationContext = createContext<CitationContextType>({
  hoveredCitationId: null,
  setHoveredCitationId: () => {},
});

export function useHighlightState(citationId: string | undefined) {
  const { hoveredCitationId } = useContext(CitationContext);
  return citationId && hoveredCitationId === citationId;
}

export function useCitation(
  turn: number,
  _refType: string,
  index: number,
): (t.Citation & t.Reference) | undefined {
  const { searchResults } = useSearchContext();
  const refType = _refType.toLowerCase() === 'search' ? 'organic' : _refType;

  if (!searchResults || !searchResults[turn] || !searchResults[turn][refType]) {
    return undefined;
  }

  const source = searchResults[turn][refType][index];

  if (!source) {
    return undefined;
  }

  return {
    ...source,
    turn,
    refType: refType as 'search' | 'image' | 'news' | 'video',
    index,
  };
}

export function useCompositeCitations(
  citations: Array<{ turn: number; refType: string; index: number }>,
): Array<t.Citation & t.Reference> {
  const { searchResults } = useSearchContext();

  const result: Array<t.Citation & t.Reference> = [];

  for (const { turn, refType, index } of citations) {
    if (!searchResults || !searchResults[turn] || !searchResults[turn][refType]) {
      continue;
    }

    const source = searchResults[turn][refType][index];

    if (!source) {
      continue;
    }

    result.push({
      ...source,
      turn,
      refType: refType as 'search' | 'image' | 'news' | 'video',
      index,
    });
  }

  return result;
}
