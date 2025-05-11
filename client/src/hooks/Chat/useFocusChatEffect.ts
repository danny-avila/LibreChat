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
      /** Check if the device is not a touchscreen */
      if (!window.matchMedia?.('(pointer: coarse)').matches) {
        textAreaRef.current?.focus();
      }
      navigate(`${location.pathname}${location.search ?? ''}`, { replace: true, state: {} });
    }
  }, [navigate, textAreaRef, location.pathname, location.state?.focusChat, location.search]);
}
