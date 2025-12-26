import React, { useEffect, useMemo, useState, useRef, useCallback, memo } from 'react';
import copy from 'copy-to-clipboard';
import { Clipboard, CheckMark } from '@librechat/client';
import { RefreshCw, ChevronDown, ChevronUp, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useLocalize, useDebouncedMermaid } from '~/hooks';
import cn from '~/utils/cn';

interface MermaidProps {
  /** Mermaid diagram content */
  children: string;
  /** Unique identifier */
  id?: string;
  /** Custom theme */
  theme?: string;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

const Mermaid: React.FC<MermaidProps> = memo(({ children, id, theme }) => {
  const localize = useLocalize();
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const lastValidSvgRef = useRef<string | null>(null);

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Get SVG from debounced hook (handles streaming gracefully)
  const { svg, isLoading, error } = useDebouncedMermaid({
    content: children,
    id,
    theme,
    key: retryCount,
  });

  // Store last valid SVG for showing during updates
  useEffect(() => {
    if (svg) {
      lastValidSvgRef.current = svg;
    }
  }, [svg]);

  // Process SVG and create blob URL
  const processedSvg = useMemo(() => {
    if (!svg) {
      return null;
    }

    let finalSvg = svg;

    // Firefox fix: Ensure viewBox is set correctly
    if (!svg.includes('viewBox') && svg.includes('height=') && svg.includes('width=')) {
      const widthMatch = svg.match(/width="(\d+)"/);
      const heightMatch = svg.match(/height="(\d+)"/);

      if (widthMatch && heightMatch) {
        const width = widthMatch[1];
        const height = heightMatch[1];
        finalSvg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
      }
    }

    // Ensure SVG has proper XML namespace
    if (!finalSvg.includes('xmlns')) {
      finalSvg = finalSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    return finalSvg;
  }, [svg]);

  // Create blob URL for the SVG
  useEffect(() => {
    if (!processedSvg) {
      return;
    }

    const blob = new Blob([processedSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);

    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [processedSvg]);

  const handleCopy = () => {
    copy(children.trim(), { format: 'text/plain' });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM));
    }
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start panning on left click and not on buttons/icons inside buttons
      const target = e.target as HTMLElement;
      const isButton = target.tagName === 'BUTTON' || target.closest('button');
      if (e.button === 0 && !isButton) {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        });
      }
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Header component (shared across states)
  const Header = ({ showActions = false }: { showActions?: boolean }) => (
    <div className="relative flex items-center justify-between rounded-tl-md rounded-tr-md bg-gray-700 px-4 py-2 font-sans text-xs text-gray-200">
      <span>{localize('com_ui_mermaid')}</span>
      {showActions && (
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="flex items-center gap-1 rounded-sm focus:outline focus:outline-white"
            onClick={() => setShowCode(!showCode)}
          >
            {showCode ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showCode ? localize('com_ui_hide_code') : localize('com_ui_show_code')}
          </button>
          <button
            type="button"
            className="flex gap-2 rounded-sm focus:outline focus:outline-white"
            onClick={handleCopy}
          >
            {isCopied ? (
              <>
                <CheckMark className="h-[18px] w-[18px]" />
                {localize('com_ui_copied')}
              </>
            ) : (
              <>
                <Clipboard />
                {localize('com_ui_copy_code')}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  // Zoom controls - inline JSX to avoid stale closure issues
  const zoomControls = (
    <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-md bg-gray-800/90 p-1 shadow-lg">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleZoomOut();
        }}
        disabled={zoom <= MIN_ZOOM}
        className="rounded p-1.5 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"
        title={localize('com_ui_zoom_out')}
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <span className="min-w-[3rem] text-center text-xs text-gray-300">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleZoomIn();
        }}
        disabled={zoom >= MAX_ZOOM}
        className="rounded p-1.5 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"
        title={localize('com_ui_zoom_in')}
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-gray-600" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleResetZoom();
        }}
        disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
        className="rounded p-1.5 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"
        title={localize('com_ui_reset_zoom')}
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );

  // Loading state - show last valid diagram with loading indicator, or spinner
  if (isLoading) {
    // If we have a previous valid render, show it with a subtle loading indicator
    if (lastValidSvgRef.current && blobUrl) {
      return (
        <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
          <Header showActions />
          <div
            ref={containerRef}
            className={cn(
              'relative overflow-hidden p-4',
              'rounded-b-md bg-white dark:bg-gray-800',
              isPanning ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{ minHeight: '200px', maxHeight: '600px' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-gray-800/80 px-2 py-1 text-xs text-gray-300">
              <div className="h-3 w-3 animate-spin rounded-full border border-gray-500 border-t-blue-500" />
            </div>
            <div
              className="flex items-center justify-center"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px)`,
                transition: isPanning ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              <img
                src={blobUrl}
                alt="Mermaid diagram"
                className="max-w-full select-none opacity-70"
                style={{
                  maxHeight: '500px',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
            </div>
            {zoomControls}
          </div>
        </div>
      );
    }

    // No previous render, show full loading state
    return (
      <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
        <Header />
        <div className="flex min-h-[200px] items-center justify-center rounded-b-md bg-white p-4 dark:bg-gray-800">
          <div className="text-center">
            <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-600" />
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {localize('com_ui_mermaid_rendering')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
        <Header showActions />
        <div className="rounded-b-md border border-red-500/30 bg-red-500/10 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-red-400">{localize('com_ui_mermaid_failed')}</span>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
            >
              <RefreshCw className="h-3 w-3" />
              {localize('com_ui_retry')}
            </button>
          </div>
          <pre className="overflow-auto text-xs text-red-300">{error.message}</pre>
          {showCode && (
            <div className="mt-4 border-t border-gray-700 pt-4">
              <div className="mb-2 text-xs text-gray-400">{localize('com_ui_mermaid_source')}</div>
              <pre className="overflow-auto whitespace-pre-wrap text-xs text-gray-300">
                {children}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Success state
  if (!blobUrl) {
    return null;
  }

  return (
    <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
      <Header showActions />
      {showCode && (
        <div className="border-b border-gray-700 bg-gray-800 p-4">
          <pre className="overflow-auto whitespace-pre-wrap text-xs text-gray-300">{children}</pre>
        </div>
      )}
      <div
        ref={containerRef}
        className={cn(
          'relative overflow-hidden p-4',
          'bg-white dark:bg-gray-800',
          !showCode && 'rounded-b-md',
          isPanning ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{ minHeight: '200px', maxHeight: '600px' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transition: isPanning ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <img
            src={blobUrl}
            alt="Mermaid diagram"
            className="max-w-full select-none"
            style={{
              maxHeight: '500px',
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
            }}
            draggable={false}
          />
        </div>
        {zoomControls}
      </div>
    </div>
  );
});

Mermaid.displayName = 'Mermaid';

export default Mermaid;
