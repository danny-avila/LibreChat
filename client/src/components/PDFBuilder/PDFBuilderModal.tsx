/**
 * PDFBuilderModal Component
 *
 * A centered partial modal that displays the PDF Builder iframe.
 * Uses Radix UI Dialog for accessibility and Framer Motion for animations.
 *
 * Features:
 * - Centered on screen (85vw × 88vh on desktop, full-screen on mobile)
 * - Semi-transparent backdrop
 * - Closes with ESC key or × button (backdrop click disabled for safety)
 * - Smooth fade + scale animation
 * - Theme-aware (dark/light mode)
 * - Auto-syncs theme with iframe
 *
 * @example
 * ```tsx
 * // Modal is controlled via Recoil state
 * const setPDFBuilder = useSetRecoilState(pdfBuilderState);
 *
 * // Open modal
 * setPDFBuilder(prev => ({ ...prev, isOpen: true }));
 *
 * // Component auto-renders based on state
 * <PDFBuilderModal />
 * ```
 */

import { useEffect } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { X } from 'lucide-react';
import { useTheme, useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks/AuthContext';
import { PDFBuilderIframe } from './PDFBuilderIframe';
import { pdfBuilderState } from '~/store/pdfBuilder';
import store from '~/store';
import type { PDFGeneratedPayload, ErrorPayload } from './types';

// PDF Builder URL from environment variable
const PDF_BUILDER_URL =
  import.meta.env.VITE_PDF_BUILDER_URL || 'https://client.dev.scaffad.cloud.jamot.pro/';

export function PDFBuilderModal() {
  const [state, setState] = useRecoilState(pdfBuilderState);
  const { user } = useAuthContext();
  const { showToast } = useToastContext();

  // Get current theme from theme context
  const { theme: themeMode } = useTheme();
  const theme = themeMode === 'dark' ? 'dark' : 'light';

  // Get current conversation from store
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const conversationId = conversation?.conversationId || null;

  // ----------------------------------------
  // EVENT HANDLERS
  // ----------------------------------------

  /**
   * Close the modal
   */
  const handleClose = () => {
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  /**
   * Open Scaffad Shop in a new tab using the LibreChat SSO endpoint.
   */
  const handleOpenScaffadShop = () => {
    window.open('/scaffad/shop', '_blank', 'noopener,noreferrer');
  };

  /**
   * Handle successful PDF generation
   */
  const handlePDFGenerated = (payload: PDFGeneratedPayload) => {
    console.log('[PDFBuilderModal] PDF generated:', payload);

    // Show success toast with download button
    showToast({
      message: 'PDF Generated Successfully!',
      status: 'success',
      duration: 10000, // 10 seconds
    });

    // Optional: Auto-close modal after delay
    // setTimeout(() => handleClose(), 2000);
  };

  /**
   * Handle errors from PDF Builder
   */
  const handleError = (payload: ErrorPayload) => {
    console.error('[PDFBuilderModal] Error:', payload);

    // Show error toast
    showToast({
      message: payload.message || 'Failed to generate PDF',
      status: 'error',
      duration: 5000,
    });
  };

  /**
   * Handle iframe ready event
   */
  const handleReady = () => {
    console.log('[PDFBuilderModal] PDF Builder is ready');
  };

  // ----------------------------------------
  // LOCK BODY SCROLL WHEN MODAL IS OPEN
  // ----------------------------------------

  useEffect(() => {
    if (state.isOpen) {
      // Lock body scroll
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scroll
      document.body.style.overflow = '';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [state.isOpen]);

  // ----------------------------------------
  // RENDER
  // ----------------------------------------

  return (
    <>
      {state.isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            style={{ zIndex: 998 }}
            onClick={handleClose}
          />

          {/* Modal Content */}
          <div
            className="rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/50"
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '85vw',
              height: '88vh',
              maxWidth: '1400px',
              maxHeight: '900px',
              zIndex: 999,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-builder-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              {/* Title */}
              <h2
                id="pdf-builder-title"
                className="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                📄 PDF Builder
              </h2>

              <div className="flex items-center gap-3">
                {/* Open Scaffad Shop */}
                <button
                  type="button"
                  onClick={handleOpenScaffadShop}
                  className="hidden rounded-lg border border-blue-500 px-3 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/40 md:inline-flex"
                >
                  Open Shop
                </button>

                {/* Close Button */}
                <button
                  onClick={handleClose}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label="Close PDF Builder"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Body (Iframe Container) */}
            <div className="h-[calc(100%-60px)] p-4">
              {user ? (
                <PDFBuilderIframe
                  url={PDF_BUILDER_URL}
                  userId={user.id}
                  conversationId={conversationId}
                  theme={theme as 'dark' | 'light'}
                  onReady={handleReady}
                  onPDFGenerated={handlePDFGenerated}
                  onError={handleError}
                  onClose={handleClose}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-gray-600 dark:text-gray-400">
                    Please log in to use PDF Builder
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
