import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Button, OGDialog, OGDialogContent, TooltipAnchor } from '@librechat/client';
import { X, ZoomIn, ZoomOut, RotateCcw, Copy, Check, Download } from 'lucide-react';
import { useLocalize } from '~/hooks';

interface DialogMermaidProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  svgContent: string;
  code: string;
  dimensions: { width: number; height: number } | null;
}

export default function DialogMermaid({
  isOpen,
  onOpenChange,
  svgContent,
  code,
  dimensions,
}: DialogMermaidProps) {
  const localize = useLocalize();
  const [copied, setCopied] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialScale, setInitialScale] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);

  const sanitizedSvg = useMemo(
    () =>
      DOMPurify.sanitize(svgContent, {
        USE_PROFILES: { svg: true, svgFilters: true },
        ADD_TAGS: ['foreignObject'],
        ADD_ATTR: ['requiredExtensions'],
      }),
    [svgContent],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleDownloadSvg = useCallback(() => {
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mermaid-diagram.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [svgContent]);

  const resetZoom = useCallback(() => {
    setZoom(initialScale);
    setPanX(0);
    setPanY(0);
  }, [initialScale]);

  const handleDoubleClick = useCallback(() => {
    if (zoom > 1) {
      resetZoom();
    } else {
      setZoom(2);
    }
  }, [zoom, resetZoom]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.1), 10);

      if (newZoom === zoom) return;

      const containerCenterX = rect.width / 2;
      const containerCenterY = rect.height / 2;

      const zoomRatio = newZoom / zoom;
      const deltaX = (mouseX - containerCenterX - panX) * (zoomRatio - 1);
      const deltaY = (mouseY - containerCenterY - panY) * (zoomRatio - 1);

      setZoom(newZoom);
      setPanX(panX - deltaX);
      setPanY(panY - deltaY);
    },
    [zoom, panX, panY],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: e.clientX - panX,
        y: e.clientY - panY,
      });
    },
    [panX, panY],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      const newPanX = e.clientX - dragStart.x;
      const newPanY = e.clientY - dragStart.y;
      setPanX(newPanX);
      setPanY(newPanY);
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * 1.2, 10));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(z * 0.8, 0.1));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoom > 1) {
          resetZoom();
        } else {
          onOpenChange(false);
        }
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', onKey);
    }
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, zoom, resetZoom, onOpenChange]);

  useEffect(() => {
    if (isOpen) {
      resetZoom();
    }
  }, [isOpen, resetZoom]);

  useEffect(() => {
    if (!isOpen || !dimensions) return;

    const padding = 100;
    const availableWidth = window.innerWidth - padding * 2;
    const availableHeight = window.innerHeight - padding * 2;

    const scaleX = availableWidth / dimensions.width;
    const scaleY = availableHeight / dimensions.height;
    const fitScale = Math.min(scaleX, scaleY, 1);

    setInitialScale(fitScale);
    setZoom(fitScale);
    setPanX(0);
    setPanY(0);
  }, [isOpen, dimensions]);

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent
        showCloseButton={false}
        className="h-full w-full rounded-none bg-transparent"
        overlayClassName="bg-surface-primary opacity-95 z-50"
      >
        <div className="relative h-full w-full">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-3 sm:p-4">
            <TooltipAnchor
              description={localize('com_ui_close')}
              render={
                <Button
                  onClick={() => onOpenChange(false)}
                  variant="ghost"
                  className="pointer-events-auto h-10 w-10 p-0 hover:bg-surface-hover"
                  aria-label={localize('com_ui_close')}
                >
                  <X className="size-7 sm:size-6" aria-hidden="true" />
                </Button>
              }
            />
            <div className="pointer-events-auto flex items-center gap-1 sm:gap-2">
              <TooltipAnchor
                description={localize('com_ui_zoom_in') || 'Zoom in'}
                render={
                  <Button
                    onClick={zoomIn}
                    variant="ghost"
                    className="h-10 w-10 p-0"
                    aria-label={localize('com_ui_zoom_in') || 'Zoom in'}
                  >
                    <ZoomIn className="size-6" aria-hidden="true" />
                  </Button>
                }
              />
              <TooltipAnchor
                description={localize('com_ui_zoom_out') || 'Zoom out'}
                render={
                  <Button
                    onClick={zoomOut}
                    variant="ghost"
                    className="h-10 w-10 p-0"
                    aria-label={localize('com_ui_zoom_out') || 'Zoom out'}
                  >
                    <ZoomOut className="size-6" aria-hidden="true" />
                  </Button>
                }
              />
              <TooltipAnchor
                description={localize('com_ui_reset_zoom') || 'Reset view'}
                render={
                  <Button
                    onClick={resetZoom}
                    variant="ghost"
                    className="h-10 w-10 p-0"
                    aria-label={localize('com_ui_reset_zoom') || 'Reset view'}
                  >
                    <RotateCcw className="size-6" aria-hidden="true" />
                  </Button>
                }
              />
              <TooltipAnchor
                description={localize('com_ui_download') || 'Download SVG'}
                render={
                  <Button
                    onClick={handleDownloadSvg}
                    variant="ghost"
                    className="h-10 w-10 p-0"
                    aria-label={localize('com_ui_download') || 'Download SVG'}
                  >
                    <Download className="size-6" aria-hidden="true" />
                  </Button>
                }
              />
              <TooltipAnchor
                description={copied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
                render={
                  <Button
                    onClick={handleCopy}
                    variant="ghost"
                    className="h-10 w-10 p-0"
                    aria-label={copied ? localize('com_ui_copied') : localize('com_ui_copy_code')}
                  >
                    {copied ? (
                      <Check className="size-6" aria-hidden="true" />
                    ) : (
                      <Copy className="size-6" aria-hidden="true" />
                    )}
                  </Button>
                }
              />
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-md bg-surface-secondary px-3 py-1.5 text-sm text-text-secondary">
            {Math.round(zoom * 100)}%
          </div>

          <div
            ref={containerRef}
            className="absolute inset-0 flex items-center justify-center"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              overflow: 'hidden',
            }}
          >
            <div
              className="flex items-center justify-center transition-transform duration-100 ease-out"
              style={{
                transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              {/* SVG content is sanitized by mermaid securityLevel: 'strict' + DOMPurify */}
              <div dangerouslySetInnerHTML={{ __html: sanitizedSvg }} />
            </div>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
