import { matchPath } from 'react-router-dom';

const matchesRouteStart = (pathname: string, pattern: string) =>
  matchPath({ path: pattern, end: false }, pathname) != null;

export const isArtifactRoute = (pathname: string) =>
  matchesRouteStart(pathname, '/c/*') || matchesRouteStart(pathname, '/share/*');
