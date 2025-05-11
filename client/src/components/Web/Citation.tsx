/* eslint-disable i18next/no-literal-string */
import { memo, useState, useContext } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { VisuallyHidden } from '@ariakit/react';
import type { CitationProps } from './types';
import { CitationContext, useCitation, useCompositeCitations } from './Context';

interface CompositeCitationProps {
  citationId?: string;
  node?: {
    properties?: CitationProps;
  };
}

export function CompositeCitation(props: CompositeCitationProps) {
  const { citations, citationId } = props.node?.properties ?? ({} as CitationProps);
  const { setHoveredCitationId } = useContext(CitationContext);
  const [currentPage, setCurrentPage] = useState(0);

  // Use the selector to get the actual citation data
  const sources = useCompositeCitations(citations || []);

  if (!sources || sources.length === 0) return null;
  const totalPages = sources.length;

  const getInitial = (attribution: string) => {
    return (attribution || 'S')[0].toUpperCase();
  };

  const getCitationLabel = () => {
    if (!sources || sources.length === 0) return 'Source';

    const firstSource = sources[0];
    const remainingCount = sources.length - 1;

    return remainingCount > 0
      ? `${firstSource.attribution || 'Source'} +${remainingCount}`
      : firstSource.attribution || 'Source';
  };

  const handlePrevPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const currentSource = sources?.[currentPage];

  return (
    <span className="relative ml-0.5 inline-block">
      <Ariakit.HovercardProvider showTimeout={150} hideTimeout={150}>
        <div className="flex items-center">
          <Ariakit.HovercardAnchor
            render={
              <a
                href={currentSource?.link}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex h-[18px] cursor-pointer items-center rounded-xl border border-neutral-600 bg-neutral-800 px-2 py-0.5 text-xs font-medium text-blue-300 no-underline transition-colors hover:bg-neutral-700"
                onMouseEnter={() => setHoveredCitationId(citationId || null)}
                onMouseLeave={() => setHoveredCitationId(null)}
              >
                {getCitationLabel()}
              </a>
            }
          />
          <Ariakit.HovercardDisclosure className="ml-0.5 rounded-full text-neutral-500 hover:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-ring">
            <VisuallyHidden>More details about {getCitationLabel()}</VisuallyHidden>
            <ChevronDown />
          </Ariakit.HovercardDisclosure>

          <Ariakit.Hovercard
            gutter={16}
            className="z-[999] w-[300px] rounded-lg border border-neutral-600 bg-neutral-800 p-3 text-neutral-200 shadow-lg"
            portal={true}
            unmountOnHide={true}
          >
            {totalPages > 1 && (
              <div className="mb-2 flex items-center justify-between border-b border-neutral-600 pb-2">
                <div className="flex gap-2">
                  <button
                    onClick={handlePrevPage}
                    disabled={currentPage === 0}
                    style={{ opacity: currentPage === 0 ? 0.5 : 1 }}
                    className="flex cursor-pointer items-center justify-center border-none bg-transparent p-0 text-base text-blue-300"
                  >
                    ←
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages - 1}
                    style={{ opacity: currentPage === totalPages - 1 ? 0.5 : 1 }}
                    className="flex cursor-pointer items-center justify-center border-none bg-transparent p-0 text-base text-blue-300"
                  >
                    →
                  </button>
                </div>
                <div className="text-xs text-neutral-400">
                  {currentPage + 1}/{totalPages}
                </div>
              </div>
            )}

            <div className="mb-2 flex items-center">
              <div className="mr-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-300 text-[10px] text-neutral-800">
                {getInitial(currentSource.attribution || '')}
              </div>
              <strong>{currentSource.attribution}</strong>
            </div>

            <h4 className="mb-1.5 mt-0 text-sm text-neutral-200">{currentSource.title}</h4>
            <p className="my-2 text-sm text-neutral-300">{currentSource.snippet}</p>
            <small className="block break-all text-xs text-neutral-400">{currentSource.link}</small>

            {/* Navigation indicator */}
            {/* {totalPages > 1 && (
              <div className="mt-2.5 border-t border-neutral-600 pt-2.5 flex justify-center">
                <div className="flex gap-1">
                  {sources?.map((_, idx) => (
                    <a 
                      key={idx}
                      href={sources[idx].link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-2 h-2 rounded-full ${idx === currentPage ? 'bg-blue-300' : 'bg-neutral-600'} cursor-pointer`}
                      onClick={() => {
                        setCurrentPage(idx);
                      }}
                    />
                  ))}
                </div>
              </div>
            )} */}
          </Ariakit.Hovercard>
        </div>
      </Ariakit.HovercardProvider>
    </span>
  );
}

interface CitationComponentProps {
  citationId: string;
  citationType: 'span' | 'standalone' | 'composite' | 'group' | 'navlist';
  node?: {
    properties?: CitationProps;
  };
}

export function Citation(props: CitationComponentProps) {
  const { citation, citationId, citationType } = props.node?.properties ?? {};
  const { setHoveredCitationId } = useContext(CitationContext);
  const refData = useCitation(citation?.turn || 0, citation?.refType || '', citation?.index || 0);
  if (!refData) return null;

  const getInitial = () => {
    return (refData.attribution || 'S')[0].toUpperCase();
  };

  const getCitationLabel = () => {
    switch (citationType) {
      case 'standalone':
        return refData.attribution || 'Source';
      default:
        return 'Source';
    }
  };

  return (
    <span className="relative ml-0.5 inline-block">
      <Ariakit.HovercardProvider showTimeout={150} hideTimeout={150}>
        <div className="flex items-center">
          <Ariakit.HovercardAnchor
            render={
              <a
                href={refData.link}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex h-[18px] cursor-pointer items-center rounded-xl border border-neutral-600 bg-neutral-800 px-2 py-0.5 text-xs font-medium text-blue-300 no-underline transition-colors hover:bg-neutral-700"
                onMouseEnter={() => setHoveredCitationId(citationId || null)}
                onMouseLeave={() => setHoveredCitationId(null)}
              >
                {getCitationLabel()}
              </a>
            }
          />
          <Ariakit.HovercardDisclosure className="ml-0.5 rounded-full text-neutral-500 hover:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-ring">
            <VisuallyHidden>More details about {getCitationLabel()}</VisuallyHidden>
            <ChevronDown />
          </Ariakit.HovercardDisclosure>

          <Ariakit.Hovercard
            gutter={16}
            className="z-[999] w-[300px] rounded-lg border border-neutral-600 bg-neutral-800 p-3 text-neutral-200 shadow-lg"
            portal={true}
            unmountOnHide={true}
          >
            <div className="mb-2 flex items-center">
              <div className="mr-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-300 text-[10px] text-neutral-800">
                {getInitial()}
              </div>
              <strong>{refData.attribution}</strong>
            </div>

            <h4 className="mb-1.5 mt-0 text-sm text-neutral-200">{refData.title}</h4>
            <p className="my-2 text-sm text-neutral-300">{refData.snippet}</p>
            <small className="block break-all text-xs text-neutral-400">{refData.link}</small>
          </Ariakit.Hovercard>
        </div>
      </Ariakit.HovercardProvider>
    </span>
  );
}

export interface HighlightedTextProps {
  children: React.ReactNode;
  citationId?: string;
}

export function useHighlightState(citationId: string | undefined) {
  const { hoveredCitationId } = useContext(CitationContext);
  return citationId && hoveredCitationId === citationId;
}

export const HighlightedText = memo(function HighlightedText({
  children,
  citationId,
}: HighlightedTextProps) {
  const isHighlighted = useHighlightState(citationId);

  return (
    <span
      className={`rounded px-0 py-0.5 transition-colors ${isHighlighted ? 'bg-amber-300/20' : ''}`}
    >
      {children}
    </span>
  );
});
