import { useEffect, RefObject } from 'react';
type Handler = () => void;

export default function useOnClickOutside(
  ref: RefObject<HTMLElement>,
  handler: Handler,
  excludeIds: string[],
): void {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && 'id' in target && excludeIds.includes((target as HTMLElement).id)) {
        return;
      }

      if (ref.current && !ref.current.contains(target)) {
        handler();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, handler]);
}
