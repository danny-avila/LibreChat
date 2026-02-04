import { useEffect, useMemo, useState } from 'react';
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

export default function PdfViewer({ fileUrl, initialPage = 1, onClose, title }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPageNumber(initialPage);
  }, [initialPage]);

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

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
    >
      <header className="flex items-center justify-between border-b border-white/20 px-4 py-2 text-white">
        <div className="flex items-center gap-3 text-sm">
          {numPages ? (
            <span className="text-white/70">
              {pageNumber}/{numPages}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-white">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            className="rounded px-2 py-1 transition hover:bg-white/10 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className="rounded px-2 py-1 transition hover:bg-white/10 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
          <div className="mx-2 h-4 border-l border-white/20" />
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            className="flex items-center rounded px-2 py-1 transition hover:bg-white/10 disabled:opacity-40"
            aria-label="Zoom out"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            className="flex items-center rounded px-2 py-1 transition hover:bg-white/10 disabled:opacity-40"
            aria-label="Zoom in"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 rounded p-2 transition hover:bg-white/10"
            aria-label="Close PDF viewer"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-start justify-center overflow-auto bg-neutral-900 py-6">
        <Document
          file={fileUrl}
          onLoadSuccess={handleDocumentLoad}
          onLoadError={handleError}
          loading={
            <div className="flex items-center gap-2 text-white">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
              Loading PDF…
            </div>
          }
          error={
            <div className="flex items-center gap-2 text-red-400">
              <span>Failed to load PDF</span>
              {error ? <span className="text-xs text-white/70">{error}</span> : null}
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            className="bg-white shadow-xl leading-none"
          />
        </Document>
      </div>
    </div>
  );
}
