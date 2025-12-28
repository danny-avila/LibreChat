import React, { useEffect, useMemo, useState, useRef, useCallback, memo } from 'react';
import copy from 'copy-to-clipboard';
import {
  X,
  ZoomIn,
  Expand,
  ZoomOut,
  ChevronUp,
  RefreshCw,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import {
  Button,
  Spinner,
  OGDialog,
  Clipboard,
  CheckMark,
  OGDialogClose,
  OGDialogTitle,
  OGDialogContent,
} from '@librechat/client';
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Separate showCode state for dialog to avoid re-renders
  const [dialogShowCode, setDialogShowCode] = useState(false);
  const lastValidSvgRef = useRef<string | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const showCodeButtonRef = useRef<HTMLButtonElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const dialogShowCodeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogCopyButtonRef = useRef<HTMLButtonElement>(null);
  const zoomCopyButtonRef = useRef<HTMLButtonElement>(null);
  const dialogZoomCopyButtonRef = useRef<HTMLButtonElement>(null);

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  // Dialog zoom and pan state (separate from inline view)
  const [dialogZoom, setDialogZoom] = useState(1);
  const [dialogPan, setDialogPan] = useState({ x: 0, y: 0 });
  const [isDialogPanning, setIsDialogPanning] = useState(false);
  const dialogPanStartRef = useRef({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const streamingCodeRef = useRef<HTMLPreElement>(null);

  // Get SVG from debounced hook (handles streaming gracefully)
  const { svg, isLoading, error } = useDebouncedMermaid({
    content: children,
    id,
    theme,
    key: retryCount,
  });

  // Auto-scroll streaming code to bottom
  useEffect(() => {
    if (isLoading && streamingCodeRef.current) {
      streamingCodeRef.current.scrollTop = streamingCodeRef.current.scrollHeight;
    }
  }, [children, isLoading]);

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

  const handleCopy = useCallback(() => {
    copy(children.trim(), { format: 'text/plain' });
    setIsCopied(true);
    requestAnimationFrame(() => {
      copyButtonRef.current?.focus();
    });
    setTimeout(() => {
      // Save currently focused element before state update causes re-render
      const focusedElement = document.activeElement as HTMLElement | null;
      setIsCopied(false);
      // Restore focus to whatever was focused (React re-render may have disrupted it)
      requestAnimationFrame(() => {
        focusedElement?.focus();
      });
    }, 3000);
  }, [children]);

  const [isDialogCopied, setIsDialogCopied] = useState(false);
  const handleDialogCopy = useCallback(() => {
    copy(children.trim(), { format: 'text/plain' });
    setIsDialogCopied(true);
    requestAnimationFrame(() => {
      dialogCopyButtonRef.current?.focus();
    });
    setTimeout(() => {
      setIsDialogCopied(false);
      requestAnimationFrame(() => {
        dialogCopyButtonRef.current?.focus();
      });
    }, 3000);
  }, [children]);

  // Zoom controls copy with focus restoration
  const [isZoomCopied, setIsZoomCopied] = useState(false);
  const handleZoomCopy = useCallback(() => {
    copy(children.trim(), { format: 'text/plain' });
    setIsZoomCopied(true);
    requestAnimationFrame(() => {
      zoomCopyButtonRef.current?.focus();
    });
    setTimeout(() => {
      setIsZoomCopied(false);
      requestAnimationFrame(() => {
        zoomCopyButtonRef.current?.focus();
      });
    }, 3000);
  }, [children]);

  // Dialog zoom controls copy
  const handleDialogZoomCopy = useCallback(() => {
    copy(children.trim(), { format: 'text/plain' });
    requestAnimationFrame(() => {
      dialogZoomCopyButtonRef.current?.focus();
    });
  }, [children]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  // Toggle code with focus restoration
  const handleToggleCode = useCallback(() => {
    setShowCode((prev) => !prev);
    requestAnimationFrame(() => {
      showCodeButtonRef.current?.focus();
    });
  }, []);

  // Toggle dialog code with focus restoration
  const handleToggleDialogCode = useCallback(() => {
    setDialogShowCode((prev) => !prev);
    requestAnimationFrame(() => {
      dialogShowCodeButtonRef.current?.focus();
    });
  }, []);

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

  // Dialog zoom handlers
  const handleDialogZoomIn = useCallback(() => {
    setDialogZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleDialogZoomOut = useCallback(() => {
    setDialogZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleDialogResetZoom = useCallback(() => {
    setDialogZoom(1);
    setDialogPan({ x: 0, y: 0 });
  }, []);

  const handleDialogWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setDialogZoom((prev) => Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM));
    }
  }, []);

  const handleDialogMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const isButton = target.tagName === 'BUTTON' || target.closest('button');
      if (e.button === 0 && !isButton) {
        setIsDialogPanning(true);
        dialogPanStartRef.current = { x: e.clientX - dialogPan.x, y: e.clientY - dialogPan.y };
      }
    },
    [dialogPan],
  );

  const handleDialogMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDialogPanning) {
        setDialogPan({
          x: e.clientX - dialogPanStartRef.current.x,
          y: e.clientY - dialogPanStartRef.current.y,
        });
      }
    },
    [isDialogPanning],
  );

  const handleDialogMouseUp = useCallback(() => {
    setIsDialogPanning(false);
  }, []);

  const handleDialogMouseLeave = useCallback(() => {
    setIsDialogPanning(false);
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
  const Header = ({
    showActions = false,
    showExpandButton = false,
  }: {
    showActions?: boolean;
    showExpandButton?: boolean;
  }) => (
    <div className="relative flex items-center justify-between rounded-tl-md rounded-tr-md bg-gray-700 px-4 py-2 font-sans text-xs text-gray-200">
      <span>{localize('com_ui_mermaid')}</span>
      {showActions && (
        <div className="ml-auto flex gap-2">
          {showExpandButton && (
            <Button
              ref={expandButtonRef}
              variant="ghost"
              size="sm"
              className="h-auto gap-1 rounded-sm px-1 py-0 text-xs text-gray-200 hover:bg-gray-600 hover:text-white focus-visible:ring-white focus-visible:ring-offset-0"
              onClick={() => {
                setDialogShowCode(false);
                setDialogZoom(1);
                setDialogPan({ x: 0, y: 0 });
                setIsDialogOpen(true);
              }}
              title={localize('com_ui_expand')}
            >
              <Expand className="h-4 w-4" />
              {localize('com_ui_expand')}
            </Button>
          )}
          <Button
            ref={showCodeButtonRef}
            variant="ghost"
            size="sm"
            className="h-auto min-w-[6rem] gap-1 rounded-sm px-1 py-0 text-xs text-gray-200 hover:bg-gray-600 hover:text-white focus-visible:ring-white focus-visible:ring-offset-0"
            onClick={handleToggleCode}
          >
            {showCode ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showCode ? localize('com_ui_hide_code') : localize('com_ui_show_code')}
          </Button>
          <Button
            ref={copyButtonRef}
            variant="ghost"
            size="sm"
            className="h-auto gap-1 rounded-sm px-1 py-0 text-xs text-gray-200 hover:bg-gray-600 hover:text-white focus-visible:ring-white focus-visible:ring-offset-0"
            onClick={handleCopy}
          >
            {isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard />}
            {localize('com_ui_copy_code')}
          </Button>
        </div>
      )}
    </div>
  );

  // Zoom controls - inline JSX to avoid stale closure issues
  const zoomControls = (
    <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-md border border-border-light bg-surface-secondary p-1 shadow-lg">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleZoomOut();
        }}
        disabled={zoom <= MIN_ZOOM}
        className="rounded p-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
        title={localize('com_ui_zoom_out')}
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <span className="min-w-[3rem] text-center text-xs text-text-secondary">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleZoomIn();
        }}
        disabled={zoom >= MAX_ZOOM}
        className="rounded p-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
        title={localize('com_ui_zoom_in')}
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-border-medium" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleResetZoom();
        }}
        disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
        className="rounded p-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
        title={localize('com_ui_reset_zoom')}
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-border-medium" />
      <button
        ref={zoomCopyButtonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleZoomCopy();
        }}
        className="rounded p-1.5 text-text-secondary hover:bg-surface-hover"
        title={localize('com_ui_copy_code')}
      >
        {isZoomCopied ? <CheckMark className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
      </button>
    </div>
  );

  // Dialog zoom controls
  const dialogZoomControls = (
    <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-md border border-border-light bg-surface-secondary p-1 shadow-lg">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDialogZoomOut();
        }}
        disabled={dialogZoom <= MIN_ZOOM}
        className="rounded p-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
        title={localize('com_ui_zoom_out')}
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <span className="min-w-[3rem] text-center text-xs text-text-secondary">
        {Math.round(dialogZoom * 100)}%
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDialogZoomIn();
        }}
        disabled={dialogZoom >= MAX_ZOOM}
        className="rounded p-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
        title={localize('com_ui_zoom_in')}
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-border-medium" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDialogResetZoom();
        }}
        disabled={dialogZoom === 1 && dialogPan.x === 0 && dialogPan.y === 0}
        className="rounded p-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
        title={localize('com_ui_reset_zoom')}
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <div className="mx-1 h-4 w-px bg-border-medium" />
      <button
        ref={dialogZoomCopyButtonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDialogZoomCopy();
        }}
        className="rounded p-1.5 text-text-secondary hover:bg-surface-hover"
        title={localize('com_ui_copy_code')}
      >
        <Clipboard className="h-4 w-4" />
      </button>
    </div>
  );

  // Full-screen dialog - rendered inline, not as function component to avoid recreation
  const expandedDialog = (
    <OGDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} triggerRef={expandButtonRef}>
      <OGDialogContent
        showCloseButton={false}
        className="h-[85vh] max-h-[85vh] w-[90vw] max-w-[90vw] gap-0 overflow-hidden border-border-light bg-surface-primary-alt p-0"
      >
        <OGDialogTitle className="flex h-10 items-center justify-between bg-gray-700 px-4 font-sans text-xs text-gray-200">
          <span>{localize('com_ui_mermaid')}</span>
          <div className="flex gap-2">
            <Button
              ref={dialogShowCodeButtonRef}
              variant="ghost"
              size="sm"
              className="h-auto min-w-[6rem] gap-1 rounded-sm px-1 py-0 text-xs text-gray-200 hover:bg-gray-600 hover:text-white focus-visible:ring-white focus-visible:ring-offset-0"
              onClick={handleToggleDialogCode}
            >
              {dialogShowCode ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {dialogShowCode ? localize('com_ui_hide_code') : localize('com_ui_show_code')}
            </Button>
            <Button
              ref={dialogCopyButtonRef}
              variant="ghost"
              size="sm"
              className="h-auto gap-1 rounded-sm px-1 py-0 text-xs text-gray-200 hover:bg-gray-600 hover:text-white focus-visible:ring-white focus-visible:ring-offset-0"
              onClick={handleDialogCopy}
            >
              {isDialogCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard />}
              {localize('com_ui_copy_code')}
            </Button>
            <OGDialogClose className="rounded-sm p-1 text-gray-200 hover:bg-gray-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <X className="h-4 w-4" />
              <span className="sr-only">{localize('com_ui_close')}</span>
            </OGDialogClose>
          </div>
        </OGDialogTitle>
        {dialogShowCode && (
          <div className="border-b border-border-medium bg-surface-secondary p-4">
            <pre className="max-h-[150px] overflow-auto whitespace-pre-wrap text-xs text-text-secondary">
              {children}
            </pre>
          </div>
        )}
        <div
          className={cn(
            'relative flex-1 overflow-hidden p-4',
            'bg-surface-primary-alt',
            isDialogPanning ? 'cursor-grabbing' : 'cursor-grab',
          )}
          style={{ height: dialogShowCode ? 'calc(85vh - 200px)' : 'calc(85vh - 50px)' }}
          onWheel={handleDialogWheel}
          onMouseDown={handleDialogMouseDown}
          onMouseMove={handleDialogMouseMove}
          onMouseUp={handleDialogMouseUp}
          onMouseLeave={handleDialogMouseLeave}
        >
          <div
            className="flex h-full w-full items-center justify-center"
            style={{
              transform: `translate(${dialogPan.x}px, ${dialogPan.y}px)`,
              transition: isDialogPanning ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            <img
              src={blobUrl}
              alt="Mermaid diagram"
              className="max-h-full max-w-full select-none object-contain"
              style={{
                transform: `scale(${dialogZoom})`,
                transformOrigin: 'center center',
              }}
              draggable={false}
            />
          </div>
          {dialogZoomControls}
        </div>
      </OGDialogContent>
    </OGDialog>
  );

  // Loading state - show last valid diagram with loading indicator, or spinner
  if (isLoading) {
    // If we have a previous valid render, show it with a subtle loading indicator
    if (lastValidSvgRef.current && blobUrl) {
      return (
        <div className="w-full overflow-hidden rounded-md border border-border-light">
          <Header showActions />
          <div
            ref={containerRef}
            className={cn(
              'relative overflow-hidden p-4',
              'rounded-b-md bg-surface-primary-alt',
              isPanning ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{ minHeight: '250px', maxHeight: '600px' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded border border-border-light bg-surface-secondary px-2 py-1 text-xs text-text-secondary">
              <Spinner className="h-3 w-3" />
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

    // No previous render, show streaming code
    return (
      <div className="w-full overflow-hidden rounded-md border border-border-light">
        <div className="flex items-center gap-2 rounded-t-md bg-gray-700 px-4 py-2 font-sans text-xs text-gray-200">
          <Spinner className="h-3 w-3 text-gray-200" />
          <span>{localize('com_ui_mermaid')}</span>
        </div>
        <pre
          ref={streamingCodeRef}
          className="max-h-[350px] min-h-[150px] overflow-auto whitespace-pre-wrap rounded-b-md bg-surface-primary-alt p-4 font-mono text-xs text-text-secondary"
        >
          {children}
        </pre>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full overflow-hidden rounded-md border border-border-light">
        <Header showActions />
        <div className="rounded-b-md border-t border-red-500/30 bg-red-500/10 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-red-500 dark:text-red-400">
              {localize('com_ui_mermaid_failed')}
            </span>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover"
            >
              <RefreshCw className="h-3 w-3" />
              {localize('com_ui_retry')}
            </button>
          </div>
          <pre className="overflow-auto text-xs text-red-600 dark:text-red-300">
            {error.message}
          </pre>
          {showCode && (
            <div className="mt-4 border-t border-border-medium pt-4">
              <div className="mb-2 text-xs text-text-secondary">
                {localize('com_ui_mermaid_source')}
              </div>
              <pre className="overflow-auto whitespace-pre-wrap text-xs text-text-secondary">
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
    <>
      {expandedDialog}
      <div className="w-full overflow-hidden rounded-md border border-border-light">
        <Header showActions showExpandButton />
        {showCode && (
          <div className="border-b border-border-medium bg-surface-secondary p-4">
            <pre className="overflow-auto whitespace-pre-wrap text-xs text-text-secondary">
              {children}
            </pre>
          </div>
        )}
        <div
          ref={containerRef}
          className={cn(
            'relative overflow-hidden p-4',
            'bg-surface-primary-alt',
            !showCode && 'rounded-b-md',
            isPanning ? 'cursor-grabbing' : 'cursor-grab',
          )}
          style={{ minHeight: '250px', maxHeight: '600px' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className="flex min-h-[200px] items-center justify-center"
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
    </>
  );
});

Mermaid.displayName = 'Mermaid';

export default Mermaid;
