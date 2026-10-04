// hipc (RFC 051): a Frame shows a page of this app, by its URL, inside the current page — the app's own routes rendered
// with a frame-local location. Inside it $pathname, $routeParams, $queryParams, links and navigate() are the frame's:
// navigating never changes the window's URL. Everything else (session, data cache, theme, globals) is the host's.
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Location,
  type Navigator,
  type To,
  UNSAFE_LocationContext as LocationContext,
  UNSAFE_RouteContext as RouteContext,
  Router,
  createPath,
  parsePath,
  resolvePath,
} from "react-router-dom";
import { AppContext, useAppContext } from "../../components-core/AppContext";
import { createUrlWithQueryParams } from "../component-utils";

export interface FrameHandle {
  /** The frame's current URL (path + query + hash). */
  current: () => string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  reload: () => void;
}

const FRESH_ROUTES = { outlet: null, matches: [], isDataRoute: false };
let frameKeys = 0;
const toLocation = (to: string | Partial<Location>, base: string): Location => {
  const path = typeof to === "string" ? parsePath(to) : to;
  const resolved = resolvePath(path, base);
  return {
    pathname: resolved.pathname,
    search: resolved.search,
    hash: resolved.hash,
    state: null,
    key: `frame-${++frameKeys}`,
  } as Location;
};

export function FrameRouter({
  src,
  children,
  onLocationChange,
  registerHandle,
}: {
  src: string;
  children: ReactNode;
  onLocationChange?: (url: string) => void;
  registerHandle?: (handle: FrameHandle) => void;
}) {
  const [history, setHistory] = useState<{ entries: Location[]; index: number }>(() => ({
    entries: [toLocation(src || "/", "/")],
    index: 0,
  }));
  const [generation, setGeneration] = useState(0);
  // A new src is a new frame: its history starts again.
  const firstSrc = useRef(true);
  useEffect(() => {
    if (firstSrc.current) {
      firstSrc.current = false;
      return;
    }
    setHistory({ entries: [toLocation(src || "/", "/")], index: 0 });
  }, [src]);

  const location = history.entries[history.index];
  const locationRef = useRef(location);
  locationRef.current = location;

  const go = useCallback((to: To, replace?: boolean) => {
    setHistory((h) => {
      const next = toLocation(to as any, h.entries[h.index].pathname);
      if (replace) {
        const entries = h.entries.slice();
        entries[h.index] = next;
        return { entries, index: h.index };
      }
      return { entries: [...h.entries.slice(0, h.index + 1), next], index: h.index + 1 };
    });
  }, []);

  const navigator = useMemo<Navigator>(
    () => ({
      createHref: (to: To) => (typeof to === "string" ? to : createPath(to)),
      encodeLocation: (to: To) => {
        const path = typeof to === "string" ? parsePath(to) : to;
        return { pathname: path.pathname ?? "", search: path.search ?? "", hash: path.hash ?? "" };
      },
      push: (to: To) => go(to, false),
      replace: (to: To) => go(to, true),
      go: (delta: number) =>
        setHistory((h) => ({ entries: h.entries, index: Math.max(0, Math.min(h.entries.length - 1, h.index + delta)) })),
    }),
    [go],
  );

  useEffect(() => {
    onLocationChange?.(createPath(location));
  }, [location, onLocationChange]);

  useEffect(() => {
    registerHandle?.({
      current: () => createPath(locationRef.current),
      navigate: (to, options) => go(to, options?.replace),
      reload: () => setGeneration((g) => g + 1),
    });
  }, [registerHandle, go]);

  // The app's navigate() (Actions.navigate, the markup's navigate) goes through AppContext: inside the frame it moves
  // the frame. History steps (-1) move within the frame's own history.
  const appContext = useAppContext();
  const frameAppContext = useMemo(
    () =>
      appContext && {
        ...appContext,
        navigate: (to: any, options?: { queryParams?: Record<string, any>; replace?: boolean }) => {
          if (typeof to === "number") {
            navigator.go(to);
            return;
          }
          const target =
            options?.queryParams && typeof to === "string"
              ? createUrlWithQueryParams({ pathname: to, queryParams: options.queryParams })
              : to;
          go(target, !!options?.replace);
        },
      },
    [appContext, navigator, go],
  );

  return (
    // The host's router stays outside: a frame is a router of its own — its location and its route matches start
    // afresh at the boundary (else its routes would match only what is left after the host's matched parent route).
    <LocationContext.Provider value={null as any}>
      <RouteContext.Provider value={FRESH_ROUTES as any}>
      <Router location={location} navigator={navigator}>
        <AppContext.Provider value={frameAppContext as any}>
          <div key={generation} data-frame="" style={{ display: "contents" }}>
            {children}
          </div>
        </AppContext.Provider>
      </Router>
      </RouteContext.Provider>
    </LocationContext.Provider>
  );
}
