/**
 * PDFBuilderIframe Component
 * 
 * Embeds the PDF Builder application in an iframe and handles
 * bidirectional communication via the postMessage API.
 * 
 * @example
 * ```tsx
 * <PDFBuilderIframe
 *   url="https://client.dev.scaffad.cloud.jamot.pro/"
 *   userId="user-123"
 *   conversationId="conv-456"
 *   theme="dark"
 *   onPDFGenerated={(payload) => console.log('PDF ready:', payload.pdfUrl)}
 *   onError={(error) => console.error('Error:', error.message)}
 * />
 * ```
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useSetRecoilState } from 'recoil';
import { cn } from '~/utils';
import { pdfBuilderState } from '~/store/pdfBuilder';
import type {
  PDFBuilderIframeProps,
  PDFBuilderMessageType,
  PDFGeneratedPayload,
  ErrorPayload,
} from './types';

export function PDFBuilderIframe({
  url,
  userId,
  conversationId,
  theme,
  templateHint,
  onReady,
  onPDFGenerated,
  onError,
  onClose,
}: PDFBuilderIframeProps) {
  // Ref to access the iframe DOM element
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Local state for iframe ready status
  const [isReady, setIsReady] = useState(false);
  
  // Recoil state updater
  const setPDFBuilderState = useSetRecoilState(pdfBuilderState);

  // ----------------------------------------
  // SEND MESSAGES TO IFRAME
  // ----------------------------------------

  /**
   * Sends a message to the PDF Builder iframe
   * 
   * @param type - The message type
   * @param payload - Optional message payload
   */
  const sendMessage = useCallback(
    (type: PDFBuilderMessageType, payload?: unknown) => {
      // Safety checks
      if (!iframeRef.current) {
        console.warn('[PDFBuilder] Cannot send message: iframe ref is null');
        return;
      }

      if (!iframeRef.current.contentWindow) {
        console.warn('[PDFBuilder] Cannot send message: contentWindow is null');
        return;
      }

      // Extract origin from URL for security
      const targetOrigin = new URL(url).origin;

      // Send the message
      iframeRef.current.contentWindow.postMessage(
        { type, payload },
        targetOrigin,
      );

      console.log(`[PDFBuilder] Sent: ${type}`, payload);
    },
    [url],
  );

  // ----------------------------------------
  // RECEIVE MESSAGES FROM IFRAME
  // ----------------------------------------

  useEffect(() => {
    /**
     * Handles incoming messages from the PDF Builder iframe
     */
    const handleMessage = (event: MessageEvent) => {
      // SECURITY: In production, validate the origin
      // Uncomment this in production:
      // const expectedOrigin = new URL(url).origin;
      // if (event.origin !== expectedOrigin) {
      //   console.warn('[PDFBuilder] Rejected message from unauthorized origin:', event.origin);
      //   return;
      // }

      // Validate message structure
      if (!event.data || typeof event.data.type !== 'string') {
        return; // Not our message format
      }

      const { type, payload } = event.data;

      console.log(`[PDFBuilder] Received: ${type}`, payload);

      // Handle each message type
      switch (type) {
        case 'LOAD':
          // Iframe started loading - optional: show loading state
          console.log('[PDFBuilder] Iframe is loading...');
          break;

        case 'READY':
          // Iframe is ready to receive messages
          console.log('[PDFBuilder] Iframe is ready');
          setIsReady(true);
          setPDFBuilderState((prev) => ({ ...prev, isReady: true }));

          // Send initialization data
          sendMessage('INIT', {
            userId,
            conversationId,
            templateHint,
          });

          // Notify parent
          onReady?.();
          break;

        case 'GET_THEME':
          // Iframe is requesting the current theme
          console.log('[PDFBuilder] Iframe requested theme');
          sendMessage('THEME_CHANGE', { theme });
          break;

        case 'PDF_GENERATED':
          // PDF was successfully generated
          console.log('[PDFBuilder] PDF generated successfully');
          const pdfPayload = payload as PDFGeneratedPayload;

          // Update Recoil state with last generated PDF
          setPDFBuilderState((prev) => ({
            ...prev,
            isGenerating: false,
            lastGeneratedPDF: {
              url: pdfPayload.pdfUrl,
              jobId: pdfPayload.jobId,
              templateName: pdfPayload.templateName,
              timestamp: Date.now(),
            },
          }));

          // Notify parent
          onPDFGenerated?.(pdfPayload);
          break;

        case 'ERROR':
          // An error occurred in the PDF Builder
          console.error('[PDFBuilder] Error received:', payload);
          const errorPayload = payload as ErrorPayload;

          // Update state
          setPDFBuilderState((prev) => ({
            ...prev,
            isGenerating: false,
          }));

          // Notify parent
          onError?.(errorPayload);
          break;

        case 'CLOSE':
          // User clicked close button in the iframe
          console.log('[PDFBuilder] User requested close');
          onClose?.();
          break;

        default:
          console.warn('[PDFBuilder] Unknown message type:', type);
      }
    };

    // Start listening for messages
    window.addEventListener('message', handleMessage);

    // Cleanup: stop listening when component unmounts
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [
    url,
    userId,
    conversationId,
    templateHint,
    theme,
    sendMessage,
    setPDFBuilderState,
    onReady,
    onPDFGenerated,
    onError,
    onClose,
  ]);

  // ----------------------------------------
  // THEME SYNCHRONIZATION
  // ----------------------------------------

  /**
   * When theme changes, notify the iframe
   */
  useEffect(() => {
    if (isReady) {
      sendMessage('THEME_CHANGE', { theme });
    }
  }, [theme, isReady, sendMessage]);

  // ----------------------------------------
  // RENDER
  // ----------------------------------------

  return (
    <div className="relative h-full w-full">
      {/* Loading State */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="flex flex-col items-center gap-3">
            {/* Spinner */}
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-400" />
            {/* Loading Text */}
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Loading PDF Builder...
            </p>
          </div>
        </div>
      )}

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        src={url}
        className={cn(
          'h-full w-full border-0',
          !isReady && 'opacity-0', // Hide until ready
        )}
        allow="clipboard-write"
        title="PDF Builder"
      />
    </div>
  );
}
