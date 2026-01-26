import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logger } from '~/utils';

export default function useFocusChatEffect(textAreaRef: React.RefObject<HTMLTextAreaElement>) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (textAreaRef?.current && location.state?.focusChat) {
      logger.log(
        'conversation',
        `Focusing textarea on location state change: ${location.pathname}`,
      );

      const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
      const hasHover = window.matchMedia?.('(hover: hover)').matches;

      const path = `${location.pathname}${window.location.search ?? ''}`;
      /* Early return if mobile-like: has coarse pointer OR lacks hover */
      if (hasCoarsePointer || !hasHover) {
        navigate(path, {
          replace: true,
          state: {},
        });
        return;
      }

      textAreaRef.current?.focus();

      navigate(path, {
        replace: true,
        state: {},
      });
    }
  }, [navigate, textAreaRef, location.pathname, location.state?.focusChat]);
}
