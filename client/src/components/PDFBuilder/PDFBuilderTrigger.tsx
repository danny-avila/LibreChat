/**
 * PDFBuilderTrigger Component
 * 
 * Icon button that opens the PDF Builder modal.
 * Intended to be placed in the chat header beside the model selector.
 * 
 * Features:
 * - Icon-only (FileText icon)
 * - Tooltip on hover
 * - Accessible (keyboard navigation, aria-label)
 * - Matches LibreChat's existing header button style
 * 
 * @example
 * ```tsx
 * // Add to chat header
 * <Header>
 *   <ModelSelector />
 *   <PDFBuilderTrigger />
 * </Header>
 * ```
 */

import { FileText } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import { pdfBuilderState } from '~/store/pdfBuilder';

export function PDFBuilderTrigger() {
  const setPDFBuilderState = useSetRecoilState(pdfBuilderState);

  /**
   * Open the PDF Builder modal
   */
  const handleClick = () => {
    setPDFBuilderState((prev) => ({ ...prev, isOpen: true }));
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-center rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-800"
      aria-label="Open PDF Builder"
      title="PDF Builder"
    >
      <FileText className="h-5 w-5" />
    </button>
  );
}
