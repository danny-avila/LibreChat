import React, { useState } from 'react';
import type { UIResource } from 'librechat-data-provider';
import { getMCPSandboxUrl, buildAppToolResult, isMcpAppResource } from '~/utils/mcpApps';
import { useIsMessagesViewReadOnly } from '~/Providers';
import { useAppBridge } from '~/hooks/MCP';
import { useLocalize } from '~/hooks';

interface UIResourceCarouselProps {
  uiResources: UIResource[];
}

const SPINNER_TIMEOUT_MS = 10_000;

function MCPAppCard({
  resource,
  onHeightChange,
}: {
  resource: UIResource;
  onHeightChange?: (height: number) => void;
}) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const localize = useLocalize();
  const readOnly = useIsMessagesViewReadOnly();
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [tornDown, setTornDown] = useState(false);
  const sandboxUrl = React.useMemo(() => getMCPSandboxUrl(), []);

  React.useEffect(() => {
    if (loaded) {
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), SPINNER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  const toolResult = React.useMemo(() => buildAppToolResult(resource), [resource]);

  const handleSizeChanged = React.useCallback(
    (params: { height?: number; width?: number }) => {
      if (params.height && params.height > 0) {
        setLoaded(true);
        onHeightChange?.(params.height);
      }
    },
    [onHeightChange],
  );

  useAppBridge(
    iframeRef,
    resource,
    resource.toolArgs as Record<string, unknown> | undefined,
    toolResult,
    handleSizeChanged,
    () => setLoaded(true),
    () => setTornDown(true),
  );

  if (tornDown) {
    return null;
  }

  if (isMcpAppResource(resource) && !resource.text && readOnly) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-border-light bg-surface-secondary px-4 py-3 text-center text-sm text-text-secondary">
        {localize('com_ui_mcp_app_shared_unavailable')}
      </div>
    );
  }

  if (isMcpAppResource(resource)) {
    return (
      <>
        {!loaded && !timedOut && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-border-light bg-surface-secondary text-sm text-text-secondary">
            {localize('com_ui_loading_interactive_view')}
          </div>
        )}
        {timedOut && !loaded && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-border-light bg-surface-secondary text-sm text-text-secondary">
            {localize('com_ui_mcp_app_failed_to_load')}
          </div>
        )}
        <iframe
          ref={iframeRef}
          data-sandbox-url={sandboxUrl}
          sandbox="allow-scripts allow-forms"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            opacity: loaded ? 1 : 0,
          }}
          title={`MCP App: ${resource.toolName ?? ''}`}
        />
      </>
    );
  }

  if (resource.text) {
    return (
      <iframe
        srcDoc={resource.text}
        sandbox="allow-scripts allow-forms"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title={resource.uri}
      />
    );
  }

  return null;
}

const UIResourceCarousel: React.FC<UIResourceCarouselProps> = React.memo(({ uiResources }) => {
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isContainerHovered, setIsContainerHovered] = useState(false);
  const [cardHeights, setCardHeights] = useState<Record<number, number>>({});
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const handleCardHeightChange = React.useCallback((index: number, newHeight: number) => {
    setCardHeights((prev) => ({ ...prev, [index]: newHeight }));
  }, []);

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

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll();
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  if (uiResources.length === 0) {
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
        <button
          type="button"
          onClick={() => scroll('left')}
          className={`absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-xl bg-white p-2 text-gray-800 shadow-lg transition-all duration-200 hover:scale-110 hover:bg-gray-100 hover:shadow-xl active:scale-95 dark:bg-gray-200 dark:text-gray-800 dark:hover:bg-gray-300 ${
            isContainerHovered ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-label="Scroll left"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      <div
        ref={scrollContainerRef}
        className="hide-scrollbar flex gap-4 overflow-x-auto scroll-smooth"
      >
        {uiResources.map((uiResource, index) => {
          const cardHeight = cardHeights[index] ?? 360;
          const width = 230;

          return (
            <div
              key={index}
              className="flex-shrink-0 transform-gpu transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-5"
              style={{
                width: `${width}px`,
                height: `${cardHeight}px`,
                animationDelay: `${index * 100}ms`,
              }}
            >
              <div className="relative flex h-full flex-col">
                <MCPAppCard
                  resource={uiResource}
                  onHeightChange={(h) => handleCardHeightChange(index, h)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {showRightArrow && (
        <button
          type="button"
          onClick={() => scroll('right')}
          className={`absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-xl bg-white p-2 text-gray-800 shadow-lg transition-all duration-200 hover:scale-110 hover:bg-gray-100 hover:shadow-xl active:scale-95 dark:bg-gray-200 dark:text-gray-800 dark:hover:bg-gray-300 ${
            isContainerHovered ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-label="Scroll right"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
});

export default UIResourceCarousel;
