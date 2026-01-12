/**
 * PDF Builder Integration Components
 * 
 * Provides iframe-based integration with the PDF Builder application.
 * 
 * Main components:
 * - PDFBuilderModal: The modal container (auto-renders based on Recoil state)
 * - PDFBuilderTrigger: Button to open the modal (add to nav bar)
 * - PDFBuilderIframe: Low-level iframe component with postMessage
 * 
 * Usage:
 * 1. Add <PDFBuilderModal /> to your root layout
 * 2. Add <PDFBuilderTrigger /> to your navigation bar
 * 3. Modal opens/closes via Recoil state (pdfBuilderState)
 */

export { PDFBuilderModal } from './PDFBuilderModal';
export { PDFBuilderTrigger } from './PDFBuilderTrigger';
export { PDFBuilderIframe } from './PDFBuilderIframe';

// Export types
export type {
  PDFBuilderMessageType,
  PDFBuilderMessage,
  PDFGeneratedPayload,
  ErrorPayload,
  InitPayload,
  ThemeChangePayload,
  PDFBuilderIframeProps,
  PDFBuilderModalProps,
  PDFBuilderState,
} from './types';
