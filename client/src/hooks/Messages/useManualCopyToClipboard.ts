import { useEffect } from 'react';
import { CLEANUP_REGEX, INVALID_CITATION_REGEX } from '~/utils/citations';
import type { TMessage, SearchResultData } from 'librechat-data-provider';

export default function useManualCopyToClipboard(
  containerRef: React.RefObject<HTMLElement>,
  messageData: Partial<Pick<TMessage, 'text' | 'content'>> & {
    searchResults?: { [key: string]: SearchResultData };
  },
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleManualCopy = (e: ClipboardEvent) => {
      // Get the selected content
      const selection = window.getSelection();
      if (!selection || selection.toString().length === 0) return;

      // Create a temporary container for the selected content
      const tempDiv = document.createElement('div');
      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const clonedSelection = range ? range.cloneContents() : null;
      if (clonedSelection) {
        tempDiv.appendChild(clonedSelection);
      }

      const stripInlineStyles = (element: Element) => {
        // Remove style attribute (the main culprit for bloat)
        element.removeAttribute('style');

        // Keep essential classes, remove styling classes
        const classList = element.getAttribute('class');
        if (classList) {
          const essentialClasses = classList
            .split(' ')
            .filter(
              (cls) =>
                !cls.includes('prose') &&
                !cls.includes('dark:') &&
                !cls.includes('light') &&
                !cls.startsWith('text-') &&
                !cls.startsWith('bg-') &&
                !cls.startsWith('border-') &&
                !cls.startsWith('shadow-') &&
                !cls.startsWith('rounded-') &&
                cls.trim().length > 0,
            )
            .join(' ');

          if (essentialClasses.length > 0) {
            element.setAttribute('class', essentialClasses);
          } else {
            element.removeAttribute('class');
          }
        }

        // Recursively process all child elements
        Array.from(element.children).forEach((child) => {
          stripInlineStyles(child as Element);
        });
      };

      // Strip inline styles from cloned content
      stripInlineStyles(tempDiv);
      const cleanHtml = tempDiv.innerHTML;

      // === STEP 2: PLAIN TEXT VERSION ===
      // Get the plain text from selection
      const selectedPlainText = selection.toString();

      // Apply the same cleanup as useCopyToClipboard
      const cleanedText = selectedPlainText
        .replace(INVALID_CITATION_REGEX, '')
        .replace(CLEANUP_REGEX, '');

      // Prevent default copy behavior
      e.preventDefault();

      // Set BOTH formats to clipboard
      const clipboardData = e.clipboardData;
      if (clipboardData) {
        // Primary format: Clean HTML (for pasting into rich text editors)
        clipboardData.setData('text/html', cleanHtml);

        // Secondary format: Clean plain text (for pasting into plain text editors)
        clipboardData.setData('text/plain', cleanedText);
      }
    };

    container.addEventListener('copy', handleManualCopy);

    return () => {
      container.removeEventListener('copy', handleManualCopy);
    };
  }, [containerRef]);
}
