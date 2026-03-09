import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Spinner } from '@librechat/client';
import useSvgProcessing from './useSvgProcessing';
import useMermaidZoom from './useMermaidZoom';
import MermaidDialog from './MermaidDialog';
import MermaidHeader from './MermaidHeader';
import ZoomControls from './ZoomControls';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface MermaidProps {
  children: string;
  id?: string;
  theme?: string;
}

const Mermaid: React.FC<MermaidProps> = memo(({ children, id, theme }) => {
  const localize = useLocalize();
  const [showCode, setShowCode] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [showMobileControls, setShowMobileControls] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamingCodeRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const {
    blobUrl,
    svgDimensions,
    isLoading,
    error,
    lastValidSvgRef,
    initialScale,
    calculatedHeight,
  } = useSvgProcessing({ content: children, id, theme, retryCount, containerRef });

  const { zoom, pan, isPanning, handleZoomIn, handleZoomOut, handleResetZoom, handleMouseDown } =
    useMermaidZoom({ containerRef, wheelDep: blobUrl });

  useEffect(() => {
    if (isLoading && streamingCodeRef.current) {
      streamingCodeRef.current.scrollTop = streamingCodeRef.current.scrollHeight;
    }
  }, [children, isLoading]);

  const handleToggleCode = useCallback(() => setShowCode((prev) => !prev), []);
  const handleRetry = useCallback(() => setRetryCount((prev) => prev + 1), []);
  const handleExpand = useCallback(() => setIsDialogOpen(true), []);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isTouchDevice) {
        return;
      }
      const target = e.target as HTMLElement;
      if (!target.closest('button, a, [role="button"]')) {
        setShowMobileControls((prev) => !prev);
      }
    },
    [isTouchDevice],
  );

  const showControls = isTouchDevice
    ? showMobileControls || showCode
    : isHovered || isFocusWithin || showCode;

  const hoverHandlers = {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    onFocus: () => setIsFocusWithin(true),
    onBlur: (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsFocusWithin(false);
      }
    },
  };

  const diagramStyle = {
    width: svgDimensions ? `${svgDimensions.width * initialScale}px` : 'auto',
    height: svgDimensions ? `${svgDimensions.height * initialScale}px` : 'auto',
  };

  if (isLoading) {
    if (lastValidSvgRef.current && blobUrl) {
      return (
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-lg border transition-all duration-200',
            showControls ? 'border-border-light' : 'border-transparent',
          )}
          {...hoverHandlers}
          onClick={handleContainerClick}
        >
          <MermaidHeader
            className={cn(
              'absolute left-0 right-0 top-0 z-20',
              showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            codeContent={children}
            showCode={showCode}
            onToggleCode={handleToggleCode}
          />
          <div
            ref={containerRef}
            className={cn(
              'relative overflow-hidden rounded-md p-4 transition-colors duration-200',
              'bg-surface-primary-alt dark:bg-white/[0.03]',
              isPanning ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{ height: `${calculatedHeight}px` }}
            onMouseDown={handleMouseDown}
          >
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded border border-border-light bg-surface-secondary px-2 py-1 text-xs text-text-secondary">
              <Spinner className="h-3 w-3" />
            </div>
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: isPanning ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              <img
                src={blobUrl}
                alt="Mermaid diagram"
                className="select-none opacity-70"
                style={diagramStyle}
                draggable={false}
              />
            </div>
            <ZoomControls
              zoom={zoom}
              pan={pan}
              codeContent={children}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onReset={handleResetZoom}
              className={cn(
                'absolute bottom-2 right-2 z-10 transition-opacity duration-200',
                showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="w-full overflow-hidden rounded-lg border border-border-light">
        <div className="flex items-center gap-2 border-b border-border-light bg-surface-secondary px-4 py-2 font-sans text-xs text-text-secondary">
          <Spinner className="h-3 w-3" />
          <span className="font-medium">{localize('com_ui_mermaid')}</span>
        </div>
        <pre
          ref={streamingCodeRef}
          className="max-h-[350px] min-h-[150px] overflow-auto whitespace-pre-wrap bg-surface-primary-alt p-4 font-mono text-xs text-text-secondary"
        >
          {children}
        </pre>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full overflow-hidden rounded-lg border border-border-light">
        <MermaidHeader codeContent={children} showCode={showCode} onToggleCode={handleToggleCode} />
        <div className="border-t border-border-light bg-surface-tertiary p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-red-600 dark:text-red-400">
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
            <div className="mt-4 border-t border-border-light pt-4">
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

  if (!blobUrl) {
    return null;
  }

  return (
    <>
      <MermaidDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        triggerRef={expandButtonRef}
        blobUrl={blobUrl}
        codeContent={children}
      />
      <div
        className="relative w-full overflow-hidden rounded-lg border border-border-light transition-all duration-200"
        {...hoverHandlers}
        onClick={handleContainerClick}
      >
        <MermaidHeader
          className="border-b border-border-light bg-surface-secondary"
          actionsClassName="transition-opacity duration-200"
          codeContent={children}
          showCode={showCode}
          showExpandButton
          expandButtonRef={expandButtonRef}
          onExpand={handleExpand}
          onToggleCode={handleToggleCode}
        />
        {showCode && (
          <div className="border-b border-border-light bg-surface-secondary p-4">
            <pre className="overflow-auto whitespace-pre-wrap text-xs text-text-secondary">
              {children}
            </pre>
          </div>
        )}
        <div
          ref={containerRef}
          className={cn(
            'relative overflow-hidden p-4 transition-colors duration-200',
            'bg-surface-primary-alt dark:bg-white/[0.03]',
            isPanning ? 'cursor-grabbing' : 'cursor-grab',
          )}
          style={{ height: `${calculatedHeight}px` }}
          onMouseDown={handleMouseDown}
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            <img
              src={blobUrl}
              alt="Mermaid diagram"
              className="select-none"
              style={diagramStyle}
              draggable={false}
            />
          </div>
          <ZoomControls
            zoom={zoom}
            pan={pan}
            codeContent={children}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onReset={handleResetZoom}
            className={cn(
              'absolute bottom-2 right-2 z-10 transition-opacity duration-200',
              showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          />
        </div>
      </div>
    </>
  );
});

Mermaid.displayName = 'Mermaid';

export default Mermaid;
