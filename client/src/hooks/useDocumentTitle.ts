import { useEffect } from 'react';

function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export default useDocumentTitle;
