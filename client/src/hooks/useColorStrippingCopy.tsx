// useColorStrippingCopy.ts
import { useEffect } from 'react';

const useColorStrippingCopy = () => {
  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      const selection = document.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const clonedSelection = range.cloneContents();
        const div = document.createElement('div');
        div.appendChild(clonedSelection);

        // Remove color and background-color styles
        const elements = div.getElementsByTagName('*');
        Array.from(elements).forEach((el) => {
          if (el instanceof HTMLElement) {
            el.style.color = '';
            el.style.backgroundColor = '';
          }
        });

        if (event.clipboardData) {
          event.clipboardData.setData('text/html', div.innerHTML);
          event.clipboardData.setData('text/plain', div.innerText);
          event.preventDefault();
        }
      }
    };

    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, []);
};

export default useColorStrippingCopy;
