import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo } from 'react';
import {
  Link as RouterLink,
  useBlocker as useRouterBlocker,
  useLocation,
  useNavigate as useRouterNavigate,
} from 'react-router-dom';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { TAdminSession } from 'librechat-data-provider';
import type { Location } from 'react-router-dom';

/**
 * The admin panel was written against TanStack Router; inside SassyChat it runs under React
 * Router at `/admin`. This module gives the panel the router calls it uses (`Link`,
 * `useNavigate`, `useSearch`, `useRouter`, `useBlocker`, `getRouteApi`) with the panel's own
 * paths (`/configuration`) and object-shaped search parameters, so its screens stay as written.
 */

export const ADMIN_BASE_PATH = '/admin';

type Search = Record<string, unknown>;
type SearchUpdate = Search | ((previous: Search) => Search);

export interface NavigateOptions {
  to?: string;
  search?: SearchUpdate;
  replace?: boolean;
  hash?: string;
}

/** A location as the panel sees it: its own path, and parsed search parameters. */
export interface PanelLocation {
  pathname: string;
  search: Search;
  hash: string;
}

/** Search values as TanStack wrote them: short integers and booleans come back typed. */
function parseValue(raw: string): unknown {
  if (raw === 'true' || raw === 'false') {
    return raw === 'true';
  }
  if (/^-?\d{1,15}$/.test(raw)) {
    return Number(raw);
  }
  if (/^[[{"]/.test(raw)) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export function parseSearch(search: string): Search {
  const result: Search = {};
  new URLSearchParams(search).forEach((value, key) => {
    result[key] = parseValue(value);
  });
  return result;
}

export function stringifySearch(search: Search | undefined): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** A browser path under `/admin` for one of the panel's paths. */
export function toBrowserPath(to: string): string {
  if (/^[a-z]+:/i.test(to)) {
    return to;
  }
  const path = to.startsWith('/') ? to : `/${to}`;
  return path === '/' ? ADMIN_BASE_PATH : `${ADMIN_BASE_PATH}${path.replace(/\/$/, '')}`;
}

/** One of the panel's paths, for a browser path under `/admin`. */
export function toPanelPath(pathname: string): string {
  if (!pathname.startsWith(ADMIN_BASE_PATH)) {
    return pathname;
  }
  return pathname.slice(ADMIN_BASE_PATH.length) || '/';
}

function toPanelLocation(location: Pick<Location, 'pathname' | 'search' | 'hash'>): PanelLocation {
  return {
    pathname: toPanelPath(location.pathname),
    search: parseSearch(location.search),
    hash: location.hash,
  };
}

function useNavigateFunction(): (options: NavigateOptions) => void {
  const navigate = useRouterNavigate();
  const location = useLocation();
  return useCallback(
    (options: NavigateOptions) => {
      const previous = parseSearch(location.search);
      const search =
        typeof options.search === 'function' ? options.search(previous) : options.search;
      const pathname = options.to ? toBrowserPath(options.to) : location.pathname;
      navigate(
        {
          pathname,
          search: stringifySearch(search ?? (options.to ? undefined : previous)),
          hash: options.hash,
        },
        { replace: options.replace },
      );
    },
    [navigate, location.pathname, location.search],
  );
}

/** `from` names the route the caller is on; React Router needs no such hint. */
export function useNavigate(_options?: { from?: string }): (options: NavigateOptions) => void {
  return useNavigateFunction();
}

export function useSearch(_options?: { from?: string }): Search {
  const { search } = useLocation();
  return useMemo(() => parseSearch(search), [search]);
}

export interface PanelRouter {
  state: { location: PanelLocation };
  navigate: (options: NavigateOptions) => void;
  /** The panel re-reads its data through React Query; nothing to invalidate in the router. */
  invalidate: () => Promise<void>;
}

export function useRouter(): PanelRouter {
  const location = useLocation();
  const navigate = useNavigateFunction();
  return useMemo(
    () => ({
      state: { location: toPanelLocation(location) },
      navigate,
      invalidate: async () => undefined,
    }),
    [location, navigate],
  );
}

export interface AdminRouteContextValue {
  user: TAdminSession['user'] | null;
  /** Whether the deployment runs in organizations mode, where the panel picks a scope. */
  organizations: boolean;
  /** The deployment's name, for the panel's logo. */
  appTitle?: string;
}

/** What the panel's layout knows about the signed-in operator, for `useRouteContext`. */
export const AdminRouteContext = createContext<AdminRouteContextValue>({
  user: null,
  organizations: false,
});

/** The panel looked routes up by id; every route reads the same layout context and URL. */
export function getRouteApi(_id: string) {
  return {
    useSearch: (): Search => useSearch(),
    useNavigate: () => useNavigate(),
    useRouteContext: () => useContext(AdminRouteContext),
  };
}

export interface BlockerState {
  status: 'blocked' | 'idle';
  current?: PanelLocation;
  next?: PanelLocation;
  proceed?: () => void;
  reset?: () => void;
}

/**
 * Holds navigation while `shouldBlockFn` says so, and (with `enableBeforeUnload`) asks before the
 * tab closes or reloads, as the unsaved-changes guard expects.
 */
export function useBlocker(options: {
  shouldBlockFn: (args: { current: PanelLocation; next: PanelLocation }) => boolean;
  enableBeforeUnload?: boolean | (() => boolean);
  withResolver?: boolean;
}): BlockerState {
  const { shouldBlockFn, enableBeforeUnload } = options;
  const location = useLocation();
  const blocker = useRouterBlocker(({ currentLocation, nextLocation }) =>
    shouldBlockFn({
      current: toPanelLocation(currentLocation),
      next: toPanelLocation(nextLocation),
    }),
  );

  useEffect(() => {
    if (!enableBeforeUnload) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const block =
        typeof enableBeforeUnload === 'function' ? enableBeforeUnload() : enableBeforeUnload;
      if (block) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enableBeforeUnload]);

  if (blocker.state !== 'blocked') {
    return { status: 'idle' };
  }
  return {
    status: 'blocked',
    current: toPanelLocation(location),
    next: toPanelLocation(blocker.location),
    proceed: blocker.proceed,
    reset: blocker.reset,
  };
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  search?: Search;
  children?: ReactNode;
};

/** A link to one of the panel's paths, with object-shaped search parameters. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, search, ...props },
  ref,
) {
  return <RouterLink ref={ref} to={`${toBrowserPath(to)}${stringifySearch(search)}`} {...props} />;
});
