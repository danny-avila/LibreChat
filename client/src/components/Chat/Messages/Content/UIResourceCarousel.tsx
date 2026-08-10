import React, { useState } from 'react';
import { Button } from '@librechat/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { UIResource } from 'librechat-data-provider';
import { getResourceKey, MAX_CAROUSEL_VIEW_HEIGHT } from '~/utils/mcpApps';
import { MCPAppFrame } from '~/components/MCPUIResource/MCPAppFrame';
import { useAppBridge, useMCPAppFrame } from '~/hooks/MCP';
import { useLocalize } from '~/hooks';

interface UIResourceCarouselProps {
  uiResources: UIResource[];
}

const DEFAULT_CARD_HEIGHT = 360;
const CARD_WIDTH = 230;

function MCPAppCard({
  resource,
  onHeightChange,
  onTornDown,
}: {
  resource: UIResource;
  onHeightChange?: (height: number) => void;
  onTornDown?: () => void;
}) {
  const localize = useLocalize();
  const frame = useMCPAppFrame(resource, {
    defaultHeight: DEFAULT_CARD_HEIGHT,
    maxHeight: MAX_CAROUSEL_VIEW_HEIGHT,
    onHeightChange,
    onTornDown,
  });

  useAppBridge({
    iframeRef: frame.iframeRef,
    resource,
    toolArgs: frame.toolArgs,
    toolResult: frame.toolResult,
    active: frame.active,
    onSizeChanged: frame.onSizeChanged,
    onLoaded: frame.onLoaded,
    onTeardown: frame.onTeardown,
    onFailed: frame.onFailed,
  });

  if (frame.kind === 'unavailable') {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-center text-sm text-text-secondary">
        {localize('com_ui_mcp_app_shared_unavailable')}
      </div>
    );
  }

  if (frame.kind === 'app') {
    return <MCPAppFrame frame={frame} resource={resource} centered />;
  }

  if (frame.kind === 'static') {
    return (
      <iframe
        srcDoc={frame.inlineHtml}
        sandbox=""
        style={{ width: '100%', height: '100%', border: 'none' }}
        title={resource.uri}
      />
    );
  }

  return null;
}

const UIResourceCarousel: React.FC<UIResourceCarouselProps> = React.memo(({ uiResources }) => {
  const localize = useLocalize();
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isContainerHovered, setIsContainerHovered] = useState(false);
  // Keyed by resource identity, never by index: a removed resource would otherwise hand its measured
  // height and its render state to whichever resource reconciles onto its index.
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [tornDownKeys, setTornDownKeys] = useState<ReadonlySet<string>>(() => new Set());
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const handleCardHeightChange = React.useCallback((key: string, newHeight: number) => {
    setCardHeights((prev) => (prev[key] === newHeight ? prev : { ...prev, [key]: newHeight }));
  }, []);

  const handleCardTornDown = React.useCallback((key: string) => {
    setTornDownKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const visibleResources = React.useMemo(
    () => uiResources.filter((resource) => !tornDownKeys.has(getResourceKey(resource))),
    [uiResources, tornDownKeys],
  );

  React.useEffect(() => {
    const live = new Set(uiResources.map(getResourceKey));
    setCardHeights((prev) => {
      const kept = Object.keys(prev).filter((key) => live.has(key));
      if (kept.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(kept.map((key) => [key, prev[key]]));
    });
    setTornDownKeys((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const kept = new Set([...prev].filter((key) => live.has(key)));
      return kept.size === prev.size ? prev : kept;
    });
  }, [uiResources]);

  const handleScroll = React.useCallback(() => {
    if (!scrollContainerRef.current) return;

    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  const scroll = React.useCallback((direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;

    const viewportWidth = scrollContainerRef.current.clientWidth;
    const scrollAmount = Math.floor(viewportWidth * 0.9);
    const currentScroll = scrollContainerRef.current.scrollLeft;
    const newScroll =
      direction === 'left' ? currentScroll - scrollAmount : currentScroll + scrollAmount;

    scrollContainerRef.current.scrollTo({
      left: newScroll,
      behavior: 'smooth',
    });
  }, []);

  // The visible set is a dependency: the arrows are computed from scroll geometry, so a card that
  // was torn down (or added) leaves showRightArrow stale-true with nothing left to scroll to.
  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll();
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll, visibleResources]);

  if (visibleResources.length === 0) {
    return null;
  }

  return (
    <div
      className="relative mb-4 pt-3"
      onMouseEnter={() => setIsContainerHovered(true)}
      onMouseLeave={() => setIsContainerHovered(false)}
    >
      <div
        className={`pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-surface-primary to-transparent transition-opacity duration-500 ease-in-out ${
          showLeftArrow ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        className={`pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-surface-primary to-transparent transition-opacity duration-500 ease-in-out ${
          showRightArrow ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {showLeftArrow && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('left')}
          className={`absolute left-2 top-1/2 z-20 h-auto w-auto -translate-y-1/2 rounded-xl bg-surface-fixed p-2 text-text-fixed shadow-lg transition-all duration-200 hover:scale-110 hover:bg-surface-fixed-hover hover:text-text-fixed hover:shadow-xl active:scale-95 ${
            isContainerHovered ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-label={localize('com_ui_scroll_left')}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
      )}

      <div
        ref={scrollContainerRef}
        className="hide-scrollbar flex gap-4 overflow-x-auto scroll-smooth"
      >
        {visibleResources.map((uiResource, index) => {
          const key = getResourceKey(uiResource);
          const cardHeight = cardHeights[key] ?? DEFAULT_CARD_HEIGHT;

          return (
            <div
              key={key}
              className="flex-shrink-0 transform-gpu transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-5"
              style={{
                width: `${CARD_WIDTH}px`,
                // Definite so the iframe's height:100% resolves, with a floor so a card that never
                // reports a size is not revealed at the 150px iframe default.
                height: `${cardHeight}px`,
                minHeight: `${DEFAULT_CARD_HEIGHT}px`,
                overflow: 'hidden',
                animationDelay: `${index * 100}ms`,
              }}
            >
              <div className="relative flex h-full flex-col">
                <MCPAppCard
                  resource={uiResource}
                  onHeightChange={(height) => handleCardHeightChange(key, height)}
                  onTornDown={() => handleCardTornDown(key)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {showRightArrow && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('right')}
          className={`absolute right-2 top-1/2 z-20 h-auto w-auto -translate-y-1/2 rounded-xl bg-surface-fixed p-2 text-text-fixed shadow-lg transition-all duration-200 hover:scale-110 hover:bg-surface-fixed-hover hover:text-text-fixed hover:shadow-xl active:scale-95 ${
            isContainerHovered ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-label={localize('com_ui_scroll_right')}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
});

export default UIResourceCarousel;
