import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import copy from 'copy-to-clipboard';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import {
  Button,
  OGDialog,
  Clipboard,
  CheckMark,
  OGDialogClose,
  OGDialogTitle,
  OGDialogContent,
} from '@librechat/client';
import useMermaidZoom from './useMermaidZoom';
import ZoomControls from './ZoomControls';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface MermaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  blobUrl: string;
  codeContent: string;
}

const MermaidDialog: React.FC<MermaidDialogProps> = memo(
  ({ open, onOpenChange, triggerRef, blobUrl, codeContent }) => {
    const localize = useLocalize();
    const [showCode, setShowCode] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const showCodeButtonRef = useRef<HTMLButtonElement>(null);
    const copyButtonRef = useRef<HTMLButtonElement>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

    const {
      zoom,
      pan,
      isPanning,
      handleZoomIn,
      handleZoomOut,
      handleResetZoom,
      handleWheel,
      handleMouseDown,
    } = useMermaidZoom();

    useEffect(() => {
      if (open) {
        setShowCode(false);
        handleResetZoom();
      }
    }, [open, handleResetZoom]);

    const handleToggleCode = useCallback(() => {
      setShowCode((prev) => !prev);
      requestAnimationFrame(() => showCodeButtonRef.current?.focus());
    }, []);

    const handleCopy = useCallback(() => {
      copy(codeContent.trim(), { format: 'text/plain' });
      setIsCopied(true);
      requestAnimationFrame(() => copyButtonRef.current?.focus());
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setIsCopied(false);
        requestAnimationFrame(() => copyButtonRef.current?.focus());
      }, 3000);
    }, [codeContent]);

    return (
      <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
        <OGDialogContent
          showCloseButton={false}
          className="h-[85vh] max-h-[85vh] w-[90vw] max-w-[90vw] gap-0 overflow-hidden border-border-light bg-surface-primary-alt p-0"
        >
          <OGDialogTitle className="flex h-10 items-center justify-between border-b border-border-light bg-surface-secondary px-4 font-sans text-xs text-text-secondary">
            <span>{localize('com_ui_mermaid')}</span>
            <div className="flex gap-2">
              <Button
                ref={showCodeButtonRef}
                variant="ghost"
                size="sm"
                className="h-auto min-w-[6rem] gap-1 rounded-sm px-1 py-0 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:ring-border-heavy focus-visible:ring-offset-0"
                onClick={handleToggleCode}
              >
                {showCode ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showCode ? localize('com_ui_hide_code') : localize('com_ui_show_code')}
              </Button>
              <Button
                ref={copyButtonRef}
                variant="ghost"
                size="sm"
                className="h-auto gap-1 rounded-sm px-1 py-0 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:ring-border-heavy focus-visible:ring-offset-0"
                onClick={handleCopy}
              >
                {isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard />}
                {localize('com_ui_copy_code')}
              </Button>
              <OGDialogClose className="rounded-sm p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-heavy">
                <X className="h-4 w-4" />
                <span className="sr-only">{localize('com_ui_close')}</span>
              </OGDialogClose>
            </div>
          </OGDialogTitle>
          {showCode && (
            <div className="border-b border-border-light bg-surface-secondary p-4">
              <pre className="max-h-[150px] overflow-auto whitespace-pre-wrap text-xs text-text-secondary">
                {codeContent}
              </pre>
            </div>
          )}
          <div
            className={cn(
              'relative flex-1 overflow-hidden bg-surface-primary-alt p-4',
              isPanning ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{ height: showCode ? 'calc(85vh - 200px)' : 'calc(85vh - 50px)' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
          >
            <div
              className="flex h-full w-full items-center justify-center"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px)`,
                transition: isPanning ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              <img
                src={blobUrl}
                alt="Mermaid diagram"
                className="max-h-full max-w-full select-none object-contain"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
            </div>
            <ZoomControls
              zoom={zoom}
              pan={pan}
              codeContent={codeContent}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onReset={handleResetZoom}
              className="absolute bottom-4 right-4 z-10"
            />
          </div>
        </OGDialogContent>
      </OGDialog>
    );
  },
);

MermaidDialog.displayName = 'MermaidDialog';

export default MermaidDialog;
