import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface PDFViewerProps {
  fileUrl: string;
  fileName: string;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

export default function PDFViewer({
  fileUrl,
  fileName,
  initialPage = 1,
  onPageChange,
  className = '',
}: PDFViewerProps) {
  const localize = useLocalize();
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);

  // Load PDF.js dynamically
  useEffect(() => {
    const loadPDFJS = async () => {
      try {
        // Dynamically import PDF.js
        const pdfjsLib = await import('pdfjs-dist');
        const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs');
        
        // Set up worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
        
        // Load the PDF
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        
        pdfRef.current = pdf;
        setTotalPages(pdf.numPages);
        setIsLoading(false);
        
        // Load initial page
        loadPage(pdf, initialPage);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF document');
        setIsLoading(false);
      }
    };

    loadPDFJS();
  }, [fileUrl, initialPage]);

  const loadPage = useCallback(async (pdf: any, pageNum: number) => {
    if (!pdf || !canvasRef.current) return;

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale, rotation });
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      setCurrentPage(pageNum);
      onPageChange?.(pageNum);
    } catch (err) {
      console.error('Error loading page:', err);
      setError('Failed to load page');
    }
  }, [scale, rotation, onPageChange]);

  const goToPage = useCallback((pageNum: number) => {
    if (pageNum < 1 || pageNum > totalPages || !pdfRef.current) return;
    loadPage(pdfRef.current, pageNum);
  }, [totalPages, loadPage]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const zoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.25, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  const rotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const downloadPDF = useCallback(() => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [fileUrl, fileName]);

  // Reload page when scale or rotation changes
  useEffect(() => {
    if (pdfRef.current && currentPage) {
      loadPage(pdfRef.current, currentPage);
    }
  }, [scale, rotation, loadPage, currentPage]);

  if (isLoading) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 mx-auto"></div>
          <p className="text-text-secondary">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col bg-white', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border-medium bg-surface-primary-alt p-2">
        <div className="flex items-center gap-2">
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="flex h-8 w-8 items-center justify-center rounded border border-border-medium bg-surface-hover hover:bg-surface-active disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage}
              onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
              className="w-16 rounded border border-border-medium bg-surface-primary px-2 py-1 text-center text-sm"
            />
            <span className="text-sm text-text-secondary">of {totalPages}</span>
          </div>
          
          <button
            onClick={nextPage}
            disabled={currentPage >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded border border-border-medium bg-surface-hover hover:bg-surface-active disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="flex h-8 w-8 items-center justify-center rounded border border-border-medium bg-surface-hover hover:bg-surface-active"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          
          <span className="text-sm text-text-secondary">{Math.round(scale * 100)}%</span>
          
          <button
            onClick={zoomIn}
            className="flex h-8 w-8 items-center justify-center rounded border border-border-medium bg-surface-hover hover:bg-surface-active"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          
          <button
            onClick={rotate}
            className="flex h-8 w-8 items-center justify-center rounded border border-border-medium bg-surface-hover hover:bg-surface-active"
            aria-label="Rotate"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          
          <button
            onClick={downloadPDF}
            className="flex h-8 w-8 items-center justify-center rounded border border-border-medium bg-surface-hover hover:bg-surface-active"
            aria-label="Download PDF"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* PDF Canvas */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            className="shadow-lg"
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        </div>
      </div>
    </div>
  );
}
