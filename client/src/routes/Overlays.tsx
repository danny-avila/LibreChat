import { useLayoutEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { OverlayBackProvider, useMediaQuery } from '@librechat/client';
import { createOverlayHistory } from '~/utils/overlays';

export default function Overlays() {
  const isMobile = useMediaQuery('(max-width: 868px)');
  const location = useLocation();
  const [history] = useState(() => createOverlayHistory(window));
  useLayoutEffect(() => history.listen(), [history]);
  useLayoutEffect(() => history.navigated(), [history, location]);
  return (
    <OverlayBackProvider value={isMobile ? history.register : null}>
      <Outlet />
    </OverlayBackProvider>
  );
}
