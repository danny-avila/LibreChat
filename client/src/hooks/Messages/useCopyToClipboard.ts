import { useCallback, useEffect, useRef } from 'react';
import copy from 'copy-to-clipboard';
import { ContentTypes, SearchResultData } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import {
  SPAN_REGEX,
  CLEANUP_REGEX,
  COMPOSITE_REGEX,
  STANDALONE_PATTERN,
  INVALID_CITATION_REGEX,
} from '~/utils/citations';

type Source = {
  link: string;
  title: string;
  attribution?: string;
  type: string;
  typeIndex: number;
  citationKey: string; // Used for deduplication
};

const refTypeMap: Record<string, string> = {
  search: 'organic',
  ref: 'references',
  news: 'topStories',
  image: 'images',
  video: 'videos',
};

export default function useCopyToClipboard({
  text,
  content,
  searchResults,
}: Partial<Pick<TMessage, 'text' | 'content'>> & {
  searchResults?: { [key: string]: SearchResultData };
}) {
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = useCallback(
    (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      setIsCopied(true);

      // Get the message text from content or text
      let messageText = text ?? '';
      if (content) {
        messageText = content.reduce((acc, curr, i) => {
          if (curr.type === ContentTypes.TEXT) {
            const text = typeof curr.text === 'string' ? curr.text : curr.text.value;
            return acc + text + (i === content.length - 1 ? '' : '\n');
          }
          return acc;
        }, '');
      }

      // Early return if no search data
      if (!searchResults || Object.keys(searchResults).length === 0) {
        // Clean up any citation markers before returning
        const cleanedText = messageText
          .replace(INVALID_CITATION_REGEX, '')
          .replace(CLEANUP_REGEX, '');

        copy(cleanedText, { format: 'text/plain' });
        copyTimeoutRef.current = setTimeout(() => {
          setIsCopied(false);
        }, 3000);
        return;
      }

      // Process citations and build a citation manager
      const citationManager = processCitations(messageText, searchResults);
      let processedText = citationManager.formattedText;

      // Add citations list at the end if we have any
      if (citationManager.citations.size > 0) {
        processedText += '\n\nCitations:\n';
        // Sort citations by their reference number
        const sortedCitations = Array.from(citationManager.citations.entries()).sort(
          (a, b) => a[1].referenceNumber - b[1].referenceNumber,
        );

        // Add each citation to the text
        for (const [_, citation] of sortedCitations) {
          processedText += `[${citation.referenceNumber}] ${citation.link}\n`;
        }
      }

      copy(processedText, { format: 'text/plain' });
      copyTimeoutRef.current = setTimeout(() => {
        setIsCopied(false);
      }, 3000);
    },
    [text, content, searchResults],
  );

  return copyToClipboard;
}

/**
 * Process citations in the text and format them properly
 */
function processCitations(text: string, searchResults: { [key: string]: SearchResultData }) {
  // Maps citation keys to their info including reference numbers
  const citations = new Map<
    string,
    {
      referenceNumber: number;
      link: string;
      title?: string;
      source: Source;
    }
  >();

  // Map to track URLs to citation keys for deduplication
  const urlToCitationKey = new Map<string, string>();

  let nextReferenceNumber = 1;
  let formattedText = text;

  // Step 1: Process highlighted text first (simplify by just making it bold in markdown)
  formattedText = formattedText.replace(SPAN_REGEX, (match) => {
    const text = match.replace(/\\ue203|\\ue204/g, '');
    return `**${text}**`;
  });

  // Step 2: Find all standalone citations and composite citation blocks
  const allCitations: Array<{
    turn: string;
    type: string;
    index: string;
    position: number;
    fullMatch: string;
    isComposite: boolean;
  }> = [];

  // Find standalone citations
  let standaloneMatch: RegExpExecArray | null;
  const standaloneCopy = new RegExp(STANDALONE_PATTERN.source, 'g');
  while ((standaloneMatch = standaloneCopy.exec(formattedText)) !== null) {
    allCitations.push({
      turn: standaloneMatch[1],
      type: standaloneMatch[2],
      index: standaloneMatch[3],
      position: standaloneMatch.index,
      fullMatch: standaloneMatch[0],
      isComposite: false,
    });
  }

  // Find composite citation blocks
  let compositeMatch: RegExpExecArray | null;
  const compositeCopy = new RegExp(COMPOSITE_REGEX.source, 'g');
  while ((compositeMatch = compositeCopy.exec(formattedText)) !== null) {
    const block = compositeMatch[0];
    const blockStart = compositeMatch.index;

    // Extract individual citations within the composite block
    let citationMatch: RegExpExecArray | null;
    const citationPattern = new RegExp(STANDALONE_PATTERN.source, 'g');
    while ((citationMatch = citationPattern.exec(block)) !== null) {
      allCitations.push({
        turn: citationMatch[1],
        type: citationMatch[2],
        index: citationMatch[3],
        position: blockStart + citationMatch.index,
        fullMatch: block, // Store the full composite block
        isComposite: true,
      });
    }
  }

  // Sort citations by their position in the text
  allCitations.sort((a, b) => a.position - b.position);

  // Step 3: Process each citation and build the reference mapping
  const processedCitations = new Set<string>();
  const replacements: Array<[string, string]> = [];
  const compositeCitationsMap = new Map<string, number[]>();

  for (const citation of allCitations) {
    const { turn, type, index, fullMatch, isComposite } = citation;
    const searchData = searchResults[turn];

    if (!searchData) continue;

    const dataType = refTypeMap[type.toLowerCase()] || type.toLowerCase();
    const idx = parseInt(index, 10);

    // Skip if no matching data
    if (!searchData[dataType] || !searchData[dataType][idx]) {
      continue;
    }

    // Get source data
    const sourceData = searchData[dataType][idx];
    const sourceUrl = sourceData.link || '';

    // Skip if no link
    if (!sourceUrl) continue;

    // Check if this URL has already been cited
    let citationKey = urlToCitationKey.get(sourceUrl);

    // If not, create a new citation key
    if (!citationKey) {
      citationKey = `${turn}-${dataType}-${idx}`;
      urlToCitationKey.set(sourceUrl, citationKey);
    }

    const source: Source = {
      link: sourceUrl,
      title: sourceData.title || sourceData.name || '',
      attribution: sourceData.attribution || sourceData.source || '',
      type: dataType,
      typeIndex: idx,
      citationKey,
    };

    // Skip if already processed this citation in a composite block
    if (isComposite && processedCitations.has(fullMatch)) {
      continue;
    }

    let referenceText = '';

    // Check if this source has been cited before
    let existingCitation = citations.get(citationKey);

    if (!existingCitation) {
      // New citation
      existingCitation = {
        referenceNumber: nextReferenceNumber++,
        link: source.link,
        title: source.title,
        source,
      };
      citations.set(citationKey, existingCitation);
    }

    if (existingCitation) {
      // For composite blocks, we need to find all citations and create a combined reference
      if (isComposite) {
        // Parse all citations in this composite block if we haven't processed it yet
        if (!processedCitations.has(fullMatch)) {
          const compositeCitations: number[] = [];
          let citationMatch: RegExpExecArray | null;
          const citationPattern = new RegExp(STANDALONE_PATTERN.source, 'g');

          while ((citationMatch = citationPattern.exec(fullMatch)) !== null) {
            const cTurn = citationMatch[1];
            const cType = citationMatch[2];
            const cIndex = citationMatch[3];
            const cDataType = refTypeMap[cType.toLowerCase()] || cType.toLowerCase();

            const cSource = searchResults[cTurn]?.[cDataType]?.[parseInt(cIndex, 10)];
            if (cSource && cSource.link) {
              // Check if we've already created a citation for this URL
              const cUrl = cSource.link;
              let cKey = urlToCitationKey.get(cUrl);

              if (!cKey) {
                cKey = `${cTurn}-${cDataType}-${cIndex}`;
                urlToCitationKey.set(cUrl, cKey);
              }

              let cCitation = citations.get(cKey);

              if (!cCitation) {
                cCitation = {
                  referenceNumber: nextReferenceNumber++,
                  link: cSource.link,
                  title: cSource.title || cSource.name || '',
                  source: {
                    link: cSource.link,
                    title: cSource.title || cSource.name || '',
                    attribution: cSource.attribution || cSource.source || '',
                    type: cDataType,
                    typeIndex: parseInt(cIndex, 10),
                    citationKey: cKey,
                  },
                };
                citations.set(cKey, cCitation);
              }

              if (cCitation) {
                compositeCitations.push(cCitation.referenceNumber);
              }
            }
          }

          // Sort and deduplicate the composite citations
          const uniqueSortedCitations = [...new Set(compositeCitations)].sort((a, b) => a - b);

          // Create combined reference numbers for all citations in this composite
          referenceText =
            uniqueSortedCitations.length > 0
              ? uniqueSortedCitations.map((num) => `[${num}]`).join('')
              : '';

          processedCitations.add(fullMatch);
          compositeCitationsMap.set(fullMatch, uniqueSortedCitations);
          replacements.push([fullMatch, referenceText]);
        }

        // Skip further processing since we've handled the entire composite block
        continue;
      } else {
        // Single citation
        referenceText = `[${existingCitation.referenceNumber}]`;
        replacements.push([fullMatch, referenceText]);
      }
    }
  }

  // Step 4: Apply all replacements (from longest to shortest to avoid nested replacement issues)
  replacements.sort((a, b) => b[0].length - a[0].length);
  for (const [pattern, replacement] of replacements) {
    formattedText = formattedText.replace(pattern, replacement);
  }

  // Step 5: Remove any orphaned composite blocks at the end of the text
  // This prevents the [1][2][3][4] list that might appear at the end if there's a composite there
  formattedText = formattedText.replace(/\n\s*\[\d+\](\[\d+\])*\s*$/g, '');

  // Step 6: Clean up any remaining citation markers
  formattedText = formattedText.replace(INVALID_CITATION_REGEX, '');
  formattedText = formattedText.replace(CLEANUP_REGEX, '');

  return {
    formattedText,
    citations,
  };
}
