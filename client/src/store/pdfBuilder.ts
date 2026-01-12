/**
 * Recoil state atom for PDF Builder modal
 */
import { atom } from 'recoil';
import type { PDFBuilderState } from '~/components/PDFBuilder/types';

/**
 * Global state for the PDF Builder modal
 * 
 * Controls modal open/close state, loading status, and tracks
 * the last generated PDF for quick access.
 */
export const pdfBuilderState = atom<PDFBuilderState>({
  key: 'pdfBuilderState',
  default: {
    isOpen: false,
    isReady: false,
    isGenerating: false,
    lastGeneratedPDF: null,
  },
});
