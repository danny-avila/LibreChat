import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { getPostLoginRedirect } from '~/utils';

export default function RootRedirect() {
  const destination = useMemo(
    () => getPostLoginRedirect(new URLSearchParams(window.location.search)) ?? '/c/new',
    [],
  );
  return <Navigate to={destination} replace />;
}
