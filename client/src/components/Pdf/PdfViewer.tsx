/* eslint-disable i18next/no-literal-string */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { Minus, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type PdfViewerProps = {
  fileUrl: string;
  initialPage?: number;
  onClose?: () => void;
  title?: string;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;
const MAX_PAGE_WIDTH = 900;
const CANVAS_PADDING_X = 24;

export default function PdfViewer({ fileUrl, initialPage = 1, onClose, title }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');

  useLayoutEffect(() => {
    const node = canvasRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const available = Math.max(node.clientWidth - CANVAS_PADDING_X, 0);
      setContainerWidth(Math.min(available, MAX_PAGE_WIDTH));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setPageNumber(initialPage);
  }, [initialPage]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isEditingPage) {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isEditingPage]);

  const canGoPrev = useMemo(() => pageNumber > 1, [pageNumber]);
  const canGoNext = useMemo(
    () => (numPages ? pageNumber < numPages : false),
    [pageNumber, numPages],
  );

  const handleDocumentLoad = ({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    setError(null);
  };

  const handleError = (err: Error) => {
    setError(err.message || 'Failed to load PDF');
  };

  const zoomIn = () => setScale((prev) => Math.min(prev + SCALE_STEP, MAX_SCALE));
  const zoomOut = () => setScale((prev) => Math.max(prev - SCALE_STEP, MIN_SCALE));

  const goPrev = () => canGoPrev && setPageNumber((prev) => prev - 1);
  const goNext = () => canGoNext && setPageNumber((prev) => prev + 1);

  const startEditingPage = () => {
    setPageInput(String(pageNumber));
    setIsEditingPage(true);
  };

  const commitPageInput = () => {
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed) && numPages) {
      const clamped = Math.min(Math.max(parsed, 1), numPages);
      setPageNumber(clamped);
    }
    setIsEditingPage(false);
  };

  const cancelPageInput = () => {
    setIsEditingPage(false);
  };

  useEffect(() => {
    if (isEditingPage) {
      pageInputRef.current?.focus();
      pageInputRef.current?.select();
    }
  }, [isEditingPage]);

  const viewer = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-paper-200 dark:bg-dm-ambient"
      role="dialog"
      aria-modal="true"
      onClick={() => onClose?.()}
    >
      <header
        className="flex items-center gap-2 border-b border-transparent bg-ink-800 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white dark:border-white/[0.08] dark:bg-dm-surface2"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/10 text-white transition hover:bg-white/20 dark:bg-white/[0.06] dark:hover:bg-white/[0.10]"
          aria-label="Close PDF viewer"
        >
          <X size={20} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center text-center">
          <div className="truncate text-[14px] font-semibold leading-tight text-white dark:text-dm-text">
            {title ?? 'PDF'}
          </div>
          {numPages ? (
            <div className="mt-0.5 font-mono text-[11px] text-white/65 dark:text-dm-text-mute">
              p. {pageNumber} of {numPages}
            </div>
          ) : null}
        </div>
        <div className="h-9 w-9" aria-hidden="true" />
      </header>

      <div
        ref={canvasRef}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-4 [-webkit-overflow-scrolling:touch]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto w-fit overflow-hidden rounded-[14px] border border-[rgba(11,47,91,0.06)] bg-white shadow-[0_1px_0_rgba(11,47,91,0.04),0_12px_28px_-16px_rgba(11,47,91,0.18)] dark:border-white/[0.04] dark:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)]">
          <Document
            file={fileUrl}
            onLoadSuccess={handleDocumentLoad}
            onLoadError={handleError}
            loading={
              <div className="flex items-center gap-2 p-6 text-ink-800">
                <div className="border-ink-800/40 h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
                Loading PDF…
              </div>
            }
            error={
              <div className="flex items-center gap-2 p-6 text-signal-flag">
                {}
                <span>Failed to load PDF</span>
                {error ? <span className="text-xs text-cc-slate-500">{error}</span> : null}
              </div>
            }
          >
            {containerWidth > 0 ? (
              <Page
                pageNumber={pageNumber}
                width={containerWidth * scale}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                className="leading-none"
              />
            ) : null}
          </Document>
        </div>
      </div>

      <div
        className="px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-[18px] border border-[rgba(11,47,91,0.10)] bg-white px-3 py-2 shadow-[0_8px_24px_-8px_rgba(11,47,91,0.18)] dark:border-white/[0.14] dark:bg-dm-surface dark:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(11,47,91,0.06)] text-ink-800 transition hover:bg-[rgba(11,47,91,0.10)] disabled:opacity-40 dark:bg-white/[0.06] dark:text-dm-text dark:hover:bg-white/[0.10]"
            aria-label="Previous page"
          >
            <ChevronLeft size={18} />
          </button>
          {isEditingPage && numPages ? (
            <form
              className="flex flex-1 flex-col items-center"
              onSubmit={(event) => {
                event.preventDefault();
                commitPageInput();
              }}
            >
              <div className="flex items-baseline justify-center font-mono text-[12px] font-bold text-ink-800 dark:text-dm-text">
                <input
                  ref={pageInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={commitPageInput}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelPageInput();
                    }
                  }}
                  aria-label={`Go to page (1 to ${numPages})`}
                  className="w-12 rounded-[6px] border border-[rgba(11,47,91,0.20)] bg-white px-1 text-center font-mono text-[12px] font-bold text-ink-800 outline-none focus:border-ink-800 focus:ring-1 focus:ring-ink-800 dark:border-white/[0.20] dark:bg-dm-surface2 dark:text-dm-text dark:focus:border-white/40 dark:focus:ring-white/40"
                />
                <span className="ml-1">/ {numPages}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-cc-slate-500 dark:text-dm-text-mute">
                Enter to go, Esc to cancel
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={startEditingPage}
              disabled={!numPages}
              className="flex flex-1 flex-col items-center rounded-[10px] px-2 py-1 transition hover:bg-[rgba(11,47,91,0.06)] disabled:opacity-60 dark:hover:bg-white/[0.06]"
              aria-label="Jump to page"
            >
              <div className="font-mono text-[12px] font-bold text-ink-800 dark:text-dm-text">
                {numPages ? `${pageNumber} / ${numPages}` : `${pageNumber}`}
              </div>
              <div className="mt-0.5 text-[10px] text-cc-slate-500 dark:text-dm-text-mute">
                Tap to jump to page
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(11,47,91,0.06)] text-ink-800 transition hover:bg-[rgba(11,47,91,0.10)] disabled:opacity-40 dark:bg-white/[0.06] dark:text-dm-text dark:hover:bg-white/[0.10]"
            aria-label="Next page"
          >
            <ChevronRight size={18} />
          </button>
          <div className="mx-1 h-5 w-px bg-[rgba(11,47,91,0.10)] dark:bg-white/[0.14]" />
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(11,47,91,0.06)] text-ink-800 transition hover:bg-[rgba(11,47,91,0.10)] disabled:opacity-40 dark:bg-white/[0.06] dark:text-dm-text dark:hover:bg-white/[0.10]"
            aria-label="Zoom out"
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(11,47,91,0.06)] text-ink-800 transition hover:bg-[rgba(11,47,91,0.10)] disabled:opacity-40 dark:bg-white/[0.06] dark:text-dm-text dark:hover:bg-white/[0.10]"
            aria-label="Zoom in"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return viewer;
  }

  return createPortal(viewer, document.body);
}
