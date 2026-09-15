import { useLayoutEffect, useState } from 'react';
import { OverlayBackProvider, useMediaQuery } from '@librechat/client';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { createOverlayHistory } from '~/utils/overlays';

export default function Overlays() {
  const isMobile = useMediaQuery('(max-width: 868px)');
  const location = useLocation();
  const action = useNavigationType();
  const [history] = useState(() => createOverlayHistory(window));
  useLayoutEffect(() => history.listen(), [history]);
  useLayoutEffect(() => history.navigated(action), [action, history, location]);
  return (
    <OverlayBackProvider value={isMobile ? history.register : null}>
      <Outlet />
    </OverlayBackProvider>
  );
}
