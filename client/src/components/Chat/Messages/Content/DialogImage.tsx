import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ArrowDownToLine, PanelLeftOpen, PanelLeftClose, RotateCcw } from 'lucide-react';
import { Button, OGDialog, OGDialogContent, TooltipAnchor } from '~/components';
import { useLocalize } from '~/hooks';

const getQualityStyles = (quality: string): string => {
  if (quality === 'high') {
    return 'bg-green-100 text-green-800';
  }
  if (quality === 'low') {
    return 'bg-orange-100 text-orange-800';
  }
  return 'bg-gray-100 text-gray-800';
};

export default function DialogImage({ isOpen, onOpenChange, src = '', downloadImage, args }) {
  const localize = useLocalize();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [imageSize, setImageSize] = useState<string | null>(null);

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const getImageSize = useCallback(async (url: string) => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('Content-Length');

      if (contentLength) {
        const bytes = parseInt(contentLength, 10);
        return formatFileSize(bytes);
      }

      const fullResponse = await fetch(url);
      const blob = await fullResponse.blob();
      return formatFileSize(blob.size);
    } catch (error) {
      console.error('Error getting image size:', error);
      return null;
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getImageMaxWidth = () => {
    // On mobile (when panel overlays), use full width minus padding
    // On desktop, account for the side panel width
    if (isPromptOpen) {
      return window.innerWidth >= 640 ? 'calc(100vw - 22rem)' : 'calc(100vw - 2rem)';
    }
    return 'calc(100vw - 2rem)';
  };

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const getCursor = () => {
    if (zoom <= 1) return 'default';
    return isDragging ? 'grabbing' : 'grab';
  };

  const handleDoubleClick = useCallback(() => {
    if (zoom > 1) {
      resetZoom();
    } else {
      // Zoom in to 2x on double click when at normal zoom
      setZoom(2);
    }
  }, [zoom, resetZoom]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate zoom factor
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(Math.max(zoom * zoomFactor, 1), 5);

      if (newZoom === zoom) return;

      // If zooming back to 1, reset pan to center the image
      if (newZoom === 1) {
        setZoom(1);
        setPanX(0);
        setPanY(0);
        return;
      }

      // Calculate the zoom center relative to the current viewport
      const containerCenterX = rect.width / 2;
      const containerCenterY = rect.height / 2;

      // Calculate new pan position to zoom towards mouse cursor
      const zoomRatio = newZoom / zoom;
      const deltaX = (mouseX - containerCenterX - panX) * (zoomRatio - 1);
      const deltaY = (mouseY - containerCenterY - panY) * (zoomRatio - 1);

      setZoom(newZoom);
      setPanX(panX - deltaX);
      setPanY(panY - deltaY);
    },
    [zoom, panX, panY],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (zoom <= 1) return;
      setIsDragging(true);
      setDragStart({
        x: e.clientX - panX,
        y: e.clientY - panY,
      });
    },
    [zoom, panX, panY],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || zoom <= 1) return;
      const newPanX = e.clientX - dragStart.x;
      const newPanY = e.clientY - dragStart.y;
      setPanX(newPanX);
      setPanY(newPanY);
    },
    [isDragging, dragStart, zoom],
  );
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && resetZoom();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [resetZoom]);

  useEffect(() => {
    if (isOpen && src) {
      getImageSize(src).then(setImageSize);
      resetZoom();
    }
  }, [isOpen, src, getImageSize, resetZoom]);

  // Ensure image is centered when zoom changes to 1
  useEffect(() => {
    if (zoom === 1) {
      setPanX(0);
      setPanY(0);
    }
  }, [zoom]);

  // Reset pan when panel opens/closes to maintain centering
  useEffect(() => {
    if (zoom === 1) {
      setPanX(0);
      setPanY(0);
    }
  }, [isPromptOpen, zoom]);

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent
        showCloseButton={false}
        className="h-full w-full rounded-none bg-transparent"
        disableScroll={false}
        overlayClassName="bg-surface-primary opacity-95 z-50"
      >
        <div
          className={`ease-[cubic-bezier(0.175,0.885,0.32,1.275)] absolute left-0 top-0 z-10 flex items-center justify-between p-3 transition-all duration-500 sm:p-4 ${isPromptOpen ? 'right-0 sm:right-80' : 'right-0'}`}
        >
          <TooltipAnchor
            description={localize('com_ui_close')}
            render={
              <Button
                onClick={() => onOpenChange(false)}
                variant="ghost"
                className="h-10 w-10 p-0 hover:bg-surface-hover"
              >
                <X className="size-7 sm:size-6" />
              </Button>
            }
          />
          <div className="flex items-center gap-1 sm:gap-2">
            {zoom > 1 && (
              <TooltipAnchor
                description={localize('com_ui_reset_zoom')}
                render={
                  <Button onClick={resetZoom} variant="ghost" className="h-10 w-10 p-0">
                    <RotateCcw className="size-6" />
                  </Button>
                }
              />
            )}
            <TooltipAnchor
              description={localize('com_ui_download')}
              render={
                <Button onClick={() => downloadImage()} variant="ghost" className="h-10 w-10 p-0">
                  <ArrowDownToLine className="size-6" />
                </Button>
              }
            />
            <TooltipAnchor
              description={
                isPromptOpen
                  ? localize('com_ui_hide_image_details')
                  : localize('com_ui_show_image_details')
              }
              render={
                <Button
                  onClick={() => setIsPromptOpen(!isPromptOpen)}
                  variant="ghost"
                  className="h-10 w-10 p-0"
                >
                  {isPromptOpen ? (
                    <PanelLeftOpen className="size-7 sm:size-6" />
                  ) : (
                    <PanelLeftClose className="size-7 sm:size-6" />
                  )}
                </Button>
              }
            />
          </div>
        </div>

        {/* Main content area with image */}
        <div
          className={`ease-[cubic-bezier(0.175,0.885,0.32,1.275)] flex h-full transition-all duration-500 ${isPromptOpen ? 'mr-0 sm:mr-80' : 'mr-0'}`}
        >
          <div
            ref={containerRef}
            className="flex flex-1 items-center justify-center px-2 pb-4 pt-16 sm:px-4 sm:pt-20"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            style={{
              cursor: getCursor(),
              overflow: zoom > 1 ? 'hidden' : 'visible',
              minHeight: 0, // Allow flexbox to shrink
            }}
          >
            <div
              className="flex items-center justify-center transition-transform duration-100 ease-out"
              style={{
                transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                transformOrigin: 'center center',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={src}
                alt="Image"
                className="block object-contain"
                style={{
                  maxHeight: 'calc(100vh - 8rem)',
                  maxWidth: getImageMaxWidth(),
                  width: 'auto',
                  height: 'auto',
                }}
              />
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div
          className={`sm:shadow-l-lg ease-[cubic-bezier(0.175,0.885,0.32,1.275)] fixed right-0 top-0 z-20 h-full w-full transform border-l border-border-light bg-surface-primary shadow-2xl backdrop-blur-sm transition-transform duration-500 sm:w-80 sm:rounded-l-2xl ${
            isPromptOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Mobile pull handle - removed for cleaner look */}

          <div className="h-full overflow-y-auto p-4 sm:p-6">
            {/* Mobile close button */}
            <div className="mb-4 flex items-center justify-between sm:hidden">
              <h3 className="text-lg font-semibold text-text-primary">
                {localize('com_ui_image_details')}
              </h3>
              <Button
                onClick={() => setIsPromptOpen(false)}
                variant="ghost"
                className="h-12 w-12 p-0"
              >
                <X className="size-6" />
              </Button>
            </div>

            <div className="mb-4 hidden sm:block">
              <h3 className="mb-2 text-lg font-semibold text-text-primary">
                {localize('com_ui_image_details')}
              </h3>
              <div className="mb-4 h-px bg-border-medium"></div>
            </div>

            <div className="space-y-4 sm:space-y-6">
              {/* Prompt Section */}
              <div>
                <h4 className="mb-2 text-sm font-medium text-text-primary">
                  {localize('com_ui_prompt')}
                </h4>
                <div className="rounded-md bg-surface-tertiary p-3">
                  <p className="text-sm leading-relaxed text-text-primary">
                    {args?.prompt || 'No prompt available'}
                  </p>
                </div>
              </div>

              {/* Generation Settings */}
              <div>
                <h4 className="mb-3 text-sm font-medium text-text-primary">
                  {localize('com_ui_generation_settings')}
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-primary">{localize('com_ui_size')}:</span>
                    <span className="text-sm font-medium text-text-primary">
                      {args?.size || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-primary">{localize('com_ui_quality')}:</span>
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium capitalize ${getQualityStyles(args?.quality || '')}`}
                    >
                      {args?.quality || 'Standard'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-primary">
                      {localize('com_ui_file_size')}:
                    </span>
                    <span className="text-sm font-medium text-text-primary">
                      {imageSize || 'Loading...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
