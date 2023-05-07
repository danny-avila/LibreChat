import { useEffect } from 'react';

export default function useOnClickOutside(ref, handler, excludeIds) {
  useEffect(() => {
    const handleClickOutside = event => {
      if (excludeIds.includes(event.target.id)) {
        console.log('excluded');
        return;
      }

      if (ref.current && !ref.current.contains(event.target)) {
        handler();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, handler]);
}
