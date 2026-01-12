/**
 * TypeScript type definitions for PDF Builder integration
 * 
 * These types define the structure of messages exchanged between
 * LibreChat and the PDF Builder iframe via postMessage API.
 */

// ============================================
// MESSAGE TYPES
// ============================================

/**
 * All possible message types that can be sent/received
 */
export type PDFBuilderMessageType = 
  | 'LOAD'           // Iframe started loading
  | 'READY'          // Iframe is ready to receive messages
  | 'PDF_GENERATED'  // PDF was successfully generated
  | 'ERROR'          // An error occurred
  | 'CLOSE'          // User wants to close the builder
  | 'INIT'           // Initialize with user context
  | 'GET_THEME'      // Iframe requesting current theme
  | 'THEME_CHANGE';  // Theme has changed

/**
 * Base message structure for postMessage communication
 */
export interface PDFBuilderMessage {
  type: PDFBuilderMessageType;
  payload?: unknown;
}

// ============================================
// PAYLOAD TYPES
// ============================================

/**
 * Payload sent when a PDF is successfully generated
 */
export interface PDFGeneratedPayload {
  /** URL to download the generated PDF */
  pdfUrl: string;
  /** Unique identifier for this generation job */
  jobId: string;
  /** Name of the template that was used */
  templateName: string;
  /** Number of copies generated */
  copies: number;
}

/**
 * Payload sent when an error occurs
 */
export interface ErrorPayload {
  /** Human-readable error message */
  message: string;
  /** Additional context about the error (optional) */
  context?: string;
}

/**
 * Payload sent to initialize the PDF Builder with user context
 */
export interface InitPayload {
  /** Current user's unique identifier */
  userId: string;
  /** Current conversation ID (null if not in a conversation) */
  conversationId: string | null;
  /** Optional hint to pre-select a specific template */
  templateHint?: string;
}

/**
 * Payload sent when theme changes
 */
export interface ThemeChangePayload {
  /** Current theme mode */
  theme: 'dark' | 'light';
}

// ============================================
// COMPONENT PROPS
// ============================================

/**
 * Props for the PDFBuilderIframe component
 */
export interface PDFBuilderIframeProps {
  /** URL where the PDF Builder application is hosted */
  url: string;
  /** Current user's ID */
  userId: string;
  /** Current conversation ID (null if not in conversation) */
  conversationId: string | null;
  /** Current theme mode */
  theme: 'dark' | 'light';
  /** Optional template hint to pre-select */
  templateHint?: string;
  /** Callback when iframe becomes ready */
  onReady?: () => void;
  /** Callback when a PDF is successfully generated */
  onPDFGenerated?: (payload: PDFGeneratedPayload) => void;
  /** Callback when an error occurs */
  onError?: (payload: ErrorPayload) => void;
  /** Callback when user requests to close */
  onClose?: () => void;
}

/**
 * Props for the PDFBuilderModal component
 */
export interface PDFBuilderModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
}

// ============================================
// STATE TYPES
// ============================================

/**
 * Recoil state for PDF Builder
 */
export interface PDFBuilderState {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Whether the iframe has loaded and is ready */
  isReady: boolean;
  /** Whether a PDF is currently being generated */
  isGenerating: boolean;
  /** Information about the last successfully generated PDF */
  lastGeneratedPDF: {
    url: string;
    jobId: string;
    templateName: string;
    timestamp: number;
  } | null;
}
