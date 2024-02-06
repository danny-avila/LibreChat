/**
 * @remix-run/router v1.15.0
 *
 * Copyright (c) Remix Software Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.RemixRouter = {}));
})(this, (function (exports) { 'use strict';

  function _extends() {
    _extends = Object.assign ? Object.assign.bind() : function (target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
      return target;
    };
    return _extends.apply(this, arguments);
  }

  ////////////////////////////////////////////////////////////////////////////////
  //#region Types and Constants
  ////////////////////////////////////////////////////////////////////////////////

  /**
   * Actions represent the type of change to a location value.
   */
  let Action = /*#__PURE__*/function (Action) {
    Action["Pop"] = "POP";
    Action["Push"] = "PUSH";
    Action["Replace"] = "REPLACE";
    return Action;
  }({});

  /**
   * The pathname, search, and hash values of a URL.
   */

  // TODO: (v7) Change the Location generic default from `any` to `unknown` and
  // remove Remix `useLocation` wrapper.
  /**
   * An entry in a history stack. A location contains information about the
   * URL path, as well as possibly some arbitrary state and a key.
   */
  /**
   * A change to the current location.
   */
  /**
   * A function that receives notifications about location changes.
   */
  /**
   * Describes a location that is the destination of some navigation, either via
   * `history.push` or `history.replace`. This may be either a URL or the pieces
   * of a URL path.
   */
  /**
   * A history is an interface to the navigation stack. The history serves as the
   * source of truth for the current location, as well as provides a set of
   * methods that may be used to change it.
   *
   * It is similar to the DOM's `window.history` object, but with a smaller, more
   * focused API.
   */
  const PopStateEventType = "popstate";
  //#endregion

  ////////////////////////////////////////////////////////////////////////////////
  //#region Memory History
  ////////////////////////////////////////////////////////////////////////////////

  /**
   * A user-supplied object that describes a location. Used when providing
   * entries to `createMemoryHistory` via its `initialEntries` option.
   */
  /**
   * A memory history stores locations in memory. This is useful in stateful
   * environments where there is no web browser, such as node tests or React
   * Native.
   */
  /**
   * Memory history stores the current location in memory. It is designed for use
   * in stateful non-browser environments like tests and React Native.
   */
  function createMemoryHistory(options) {
    if (options === void 0) {
      options = {};
    }
    let {
      initialEntries = ["/"],
      initialIndex,
      v5Compat = false
    } = options;
    let entries; // Declare so we can access from createMemoryLocation
    entries = initialEntries.map((entry, index) => createMemoryLocation(entry, typeof entry === "string" ? null : entry.state, index === 0 ? "default" : undefined));
    let index = clampIndex(initialIndex == null ? entries.length - 1 : initialIndex);
    let action = Action.Pop;
    let listener = null;
    function clampIndex(n) {
      return Math.min(Math.max(n, 0), entries.length - 1);
    }
    function getCurrentLocation() {
      return entries[index];
    }
    function createMemoryLocation(to, state, key) {
      if (state === void 0) {
        state = null;
      }
      let location = createLocation(entries ? getCurrentLocation().pathname : "/", to, state, key);
      warning(location.pathname.charAt(0) === "/", "relative pathnames are not supported in memory history: " + JSON.stringify(to));
      return location;
    }
    function createHref(to) {
      return typeof to === "string" ? to : createPath(to);
    }
    let history = {
      get index() {
        return index;
      },
      get action() {
        return action;
      },
      get location() {
        return getCurrentLocation();
      },
      createHref,
      createURL(to) {
        return new URL(createHref(to), "http://localhost");
      },
      encodeLocation(to) {
        let path = typeof to === "string" ? parsePath(to) : to;
        return {
          pathname: path.pathname || "",
          search: path.search || "",
          hash: path.hash || ""
        };
      },
      push(to, state) {
        action = Action.Push;
        let nextLocation = createMemoryLocation(to, state);
        index += 1;
        entries.splice(index, entries.length, nextLocation);
        if (v5Compat && listener) {
          listener({
            action,
            location: nextLocation,
            delta: 1
          });
        }
      },
      replace(to, state) {
        action = Action.Replace;
        let nextLocation = createMemoryLocation(to, state);
        entries[index] = nextLocation;
        if (v5Compat && listener) {
          listener({
            action,
            location: nextLocation,
            delta: 0
          });
        }
      },
      go(delta) {
        action = Action.Pop;
        let nextIndex = clampIndex(index + delta);
        let nextLocation = entries[nextIndex];
        index = nextIndex;
        if (listener) {
          listener({
            action,
            location: nextLocation,
            delta
          });
        }
      },
      listen(fn) {
        listener = fn;
        return () => {
          listener = null;
        };
      }
    };
    return history;
  }
  //#endregion

  ////////////////////////////////////////////////////////////////////////////////
  //#region Browser History
  ////////////////////////////////////////////////////////////////////////////////

  /**
   * A browser history stores the current location in regular URLs in a web
   * browser environment. This is the standard for most web apps and provides the
   * cleanest URLs the browser's address bar.
   *
   * @see https://github.com/remix-run/history/tree/main/docs/api-reference.md#browserhistory
   */
  /**
   * Browser history stores the location in regular URLs. This is the standard for
   * most web apps, but it requires some configuration on the server to ensure you
   * serve the same app at multiple URLs.
   *
   * @see https://github.com/remix-run/history/tree/main/docs/api-reference.md#createbrowserhistory
   */
  function createBrowserHistory(options) {
    if (options === void 0) {
      options = {};
    }
    function createBrowserLocation(window, globalHistory) {
      let {
        pathname,
        search,
        hash
      } = window.location;
      return createLocation("", {
        pathname,
        search,
        hash
      },
      // state defaults to `null` because `window.history.state` does
      globalHistory.state && globalHistory.state.usr || null, globalHistory.state && globalHistory.state.key || "default");
    }
    function createBrowserHref(window, to) {
      return typeof to === "string" ? to : createPath(to);
    }
    return getUrlBasedHistory(createBrowserLocation, createBrowserHref, null, options);
  }
  //#endregion

  ////////////////////////////////////////////////////////////////////////////////
  //#region Hash History
  ////////////////////////////////////////////////////////////////////////////////

  /**
   * A hash history stores the current location in the fragment identifier portion
   * of the URL in a web browser environment.
   *
   * This is ideal for apps that do not control the server for some reason
   * (because the fragment identifier is never sent to the server), including some
   * shared hosting environments that do not provide fine-grained controls over
   * which pages are served at which URLs.
   *
   * @see https://github.com/remix-run/history/tree/main/docs/api-reference.md#hashhistory
   */
  /**
   * Hash history stores the location in window.location.hash. This makes it ideal
   * for situations where you don't want to send the location to the server for
   * some reason, either because you do cannot configure it or the URL space is
   * reserved for something else.
   *
   * @see https://github.com/remix-run/history/tree/main/docs/api-reference.md#createhashhistory
   */
  function createHashHistory(options) {
    if (options === void 0) {
      options = {};
    }
    function createHashLocation(window, globalHistory) {
      let {
        pathname = "/",
        search = "",
        hash = ""
      } = parsePath(window.location.hash.substr(1));

      // Hash URL should always have a leading / just like window.location.pathname
      // does, so if an app ends up at a route like /#something then we add a
      // leading slash so all of our path-matching behaves the same as if it would
      // in a browser router.  This is particularly important when there exists a
      // root splat route (<Route path="*">) since that matches internally against
      // "/*" and we'd expect /#something to 404 in a hash router app.
      if (!pathname.startsWith("/") && !pathname.startsWith(".")) {
        pathname = "/" + pathname;
      }
      return createLocation("", {
        pathname,
        search,
        hash
      },
      // state defaults to `null` because `window.history.state` does
      globalHistory.state && globalHistory.state.usr || null, globalHistory.state && globalHistory.state.key || "default");
    }
    function createHashHref(window, to) {
      let base = window.document.querySelector("base");
      let href = "";
      if (base && base.getAttribute("href")) {
        let url = window.location.href;
        let hashIndex = url.indexOf("#");
        href = hashIndex === -1 ? url : url.slice(0, hashIndex);
      }
      return href + "#" + (typeof to === "string" ? to : createPath(to));
    }
    function validateHashLocation(location, to) {
      warning(location.pathname.charAt(0) === "/", "relative pathnames are not supported in hash history.push(" + JSON.stringify(to) + ")");
    }
    return getUrlBasedHistory(createHashLocation, createHashHref, validateHashLocation, options);
  }
  //#endregion

  ////////////////////////////////////////////////////////////////////////////////
  //#region UTILS
  ////////////////////////////////////////////////////////////////////////////////

  /**
   * @private
   */
  function invariant(value, message) {
    if (value === false || value === null || typeof value === "undefined") {
      throw new Error(message);
    }
  }
  function warning(cond, message) {
    if (!cond) {
      // eslint-disable-next-line no-console
      if (typeof console !== "undefined") console.warn(message);
      try {
        // Welcome to debugging history!
        //
        // This error is thrown as a convenience, so you can more easily
        // find the source for a warning that appears in the console by
        // enabling "pause on exceptions" in your JavaScript debugger.
        throw new Error(message);
        // eslint-disable-next-line no-empty
      } catch (e) {}
    }
  }
  function createKey() {
    return Math.random().toString(36).substr(2, 8);
  }

  /**
   * For browser-based histories, we combine the state and key into an object
   */
  function getHistoryState(location, index) {
    return {
      usr: location.state,
      key: location.key,
      idx: index
    };
  }

  /**
   * Creates a Location object with a unique key from the given Path
   */
  function createLocation(current, to, state, key) {
    if (state === void 0) {
      state = null;
    }
    let location = _extends({
      pathname: typeof current === "string" ? current : current.pathname,
      search: "",
      hash: ""
    }, typeof to === "string" ? parsePath(to) : to, {
      state,
      // TODO: This could be cleaned up.  push/replace should probably just take
      // full Locations now and avoid the need to run through this flow at all
      // But that's a pretty big refactor to the current test suite so going to
      // keep as is for the time being and just let any incoming keys take precedence
      key: to && to.key || key || createKey()
    });
    return location;
  }

  /**
   * Creates a string URL path from the given pathname, search, and hash components.
   */
  function createPath(_ref) {
    let {
      pathname = "/",
      search = "",
      hash = ""
    } = _ref;
    if (search && search !== "?") pathname += search.charAt(0) === "?" ? search : "?" + search;
    if (hash && hash !== "#") pathname += hash.charAt(0) === "#" ? hash : "#" + hash;
    return pathname;
  }

  /**
   * Parses a string URL path into its separate pathname, search, and hash components.
   */
  function parsePath(path) {
    let parsedPath = {};
    if (path) {
      let hashIndex = path.indexOf("#");
      if (hashIndex >= 0) {
        parsedPath.hash = path.substr(hashIndex);
        path = path.substr(0, hashIndex);
      }
      let searchIndex = path.indexOf("?");
      if (searchIndex >= 0) {
        parsedPath.search = path.substr(searchIndex);
        path = path.substr(0, searchIndex);
      }
      if (path) {
        parsedPath.pathname = path;
      }
    }
    return parsedPath;
  }
  function getUrlBasedHistory(getLocation, createHref, validateLocation, options) {
    if (options === void 0) {
      options = {};
    }
    let {
      window = document.defaultView,
      v5Compat = false
    } = options;
    let globalHistory = window.history;
    let action = Action.Pop;
    let listener = null;
    let index = getIndex();
    // Index should only be null when we initialize. If not, it's because the
    // user called history.pushState or history.replaceState directly, in which
    // case we should log a warning as it will result in bugs.
    if (index == null) {
      index = 0;
      globalHistory.replaceState(_extends({}, globalHistory.state, {
        idx: index
      }), "");
    }
    function getIndex() {
      let state = globalHistory.state || {
        idx: null
      };
      return state.idx;
    }
    function handlePop() {
      action = Action.Pop;
      let nextIndex = getIndex();
      let delta = nextIndex == null ? null : nextIndex - index;
      index = nextIndex;
      if (listener) {
        listener({
          action,
          location: history.location,
          delta
        });
      }
    }
    function push(to, state) {
      action = Action.Push;
      let location = createLocation(history.location, to, state);
      if (validateLocation) validateLocation(location, to);
      index = getIndex() + 1;
      let historyState = getHistoryState(location, index);
      let url = history.createHref(location);

      // try...catch because iOS limits us to 100 pushState calls :/
      try {
        globalHistory.pushState(historyState, "", url);
      } catch (error) {
        // If the exception is because `state` can't be serialized, let that throw
        // outwards just like a replace call would so the dev knows the cause
        // https://html.spec.whatwg.org/multipage/nav-history-apis.html#shared-history-push/replace-state-steps
        // https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeinternal
        if (error instanceof DOMException && error.name === "DataCloneError") {
          throw error;
        }
        // They are going to lose state here, but there is no real
        // way to warn them about it since the page will refresh...
        window.location.assign(url);
      }
      if (v5Compat && listener) {
        listener({
          action,
          location: history.location,
          delta: 1
        });
      }
    }
    function replace(to, state) {
      action = Action.Replace;
      let location = createLocation(history.location, to, state);
      if (validateLocation) validateLocation(location, to);
      index = getIndex();
      let historyState = getHistoryState(location, index);
      let url = history.createHref(location);
      globalHistory.replaceState(historyState, "", url);
      if (v5Compat && listener) {
        listener({
          action,
          location: history.location,
          delta: 0
        });
      }
    }
    function createURL(to) {
      // window.location.origin is "null" (the literal string value) in Firefox
      // under certain conditions, notably when serving from a local HTML file
      // See https://bugzilla.mozilla.org/show_bug.cgi?id=878297
      let base = window.location.origin !== "null" ? window.location.origin : window.location.href;
      let href = typeof to === "string" ? to : createPath(to);
      invariant(base, "No window.location.(origin|href) available to create URL for href: " + href);
      return new URL(href, base);
    }
    let history = {
      get action() {
        return action;
      },
      get location() {
        return getLocation(window, globalHistory);
      },
      listen(fn) {
        if (listener) {
          throw new Error("A history only accepts one active listener");
        }
        window.addEventListener(PopStateEventType, handlePop);
        listener = fn;
        return () => {
          window.removeEventListener(PopStateEventType, handlePop);
          listener = null;
        };
      },
      createHref(to) {
        return createHref(window, to);
      },
      createURL,
      encodeLocation(to) {
        // Encode a Location the same way window.location would
        let url = createURL(to);
        return {
          pathname: url.pathname,
          search: url.search,
          hash: url.hash
        };
      },
      push,
      replace,
      go(n) {
        return globalHistory.go(n);
      }
    };
    return history;
  }

  //#endregion

  /**
   * Map of routeId -> data returned from a loader/action/error
   */

  let ResultType = /*#__PURE__*/function (ResultType) {
    ResultType["data"] = "data";
    ResultType["deferred"] = "deferred";
    ResultType["redirect"] = "redirect";
    ResultType["error"] = "error";
    return ResultType;
  }({});

  /**
   * Successful result from a loader or action
   */

  /**
   * Successful defer() result from a loader or action
   */

  /**
   * Redirect result from a loader or action
   */

  /**
   * Unsuccessful result from a loader or action
   */

  /**
   * Result from a loader or action - potentially successful or unsuccessful
   */

  /**
   * Users can specify either lowercase or uppercase form methods on `<Form>`,
   * useSubmit(), `<fetcher.Form>`, etc.
   */

  /**
   * Active navigation/fetcher form methods are exposed in lowercase on the
   * RouterState
   */

  /**
   * In v7, active navigation/fetcher form methods are exposed in uppercase on the
   * RouterState.  This is to align with the normalization done via fetch().
   */

  // Thanks https://github.com/sindresorhus/type-fest!

  /**
   * @private
   * Internal interface to pass around for action submissions, not intended for
   * external consumption
   */

  /**
   * @private
   * Arguments passed to route loader/action functions.  Same for now but we keep
   * this as a private implementation detail in case they diverge in the future.
   */

  // TODO: (v7) Change the defaults from any to unknown in and remove Remix wrappers:
  //   ActionFunction, ActionFunctionArgs, LoaderFunction, LoaderFunctionArgs
  //   Also, make them a type alias instead of an interface
  /**
   * Arguments passed to loader functions
   */
  /**
   * Arguments passed to action functions
   */
  /**
   * Loaders and actions can return anything except `undefined` (`null` is a
   * valid return value if there is no data to return).  Responses are preferred
   * and will ease any future migration to Remix
   */
  /**
   * Route loader function signature
   */
  /**
   * Route action function signature
   */
  /**
   * Arguments passed to shouldRevalidate function
   */
  /**
   * Route shouldRevalidate function signature.  This runs after any submission
   * (navigation or fetcher), so we flatten the navigation/fetcher submission
   * onto the arguments.  It shouldn't matter whether it came from a navigation
   * or a fetcher, what really matters is the URLs and the formData since loaders
   * have to re-run based on the data models that were potentially mutated.
   */
  /**
   * Function provided by the framework-aware layers to set `hasErrorBoundary`
   * from the framework-aware `errorElement` prop
   *
   * @deprecated Use `mapRouteProperties` instead
   */
  /**
   * Function provided by the framework-aware layers to set any framework-specific
   * properties from framework-agnostic properties
   */
  /**
   * Keys we cannot change from within a lazy() function. We spread all other keys
   * onto the route. Either they're meaningful to the router, or they'll get
   * ignored.
   */
  const immutableRouteKeys = new Set(["lazy", "caseSensitive", "path", "id", "index", "children"]);

  /**
   * lazy() function to load a route definition, which can add non-matching
   * related properties to a route
   */

  /**
   * Base RouteObject with common props shared by all types of routes
   */

  /**
   * Index routes must not have children
   */

  /**
   * Non-index routes may have children, but cannot have index
   */

  /**
   * A route object represents a logical route, with (optionally) its child
   * routes organized in a tree-like structure.
   */

  /**
   * A data route object, which is just a RouteObject with a required unique ID
   */

  // Recursive helper for finding path parameters in the absence of wildcards

  /**
   * Examples:
   * "/a/b/*" -> "*"
   * ":a" -> "a"
   * "/a/:b" -> "b"
   * "/a/blahblahblah:b" -> "b"
   * "/:a/:b" -> "a" | "b"
   * "/:a/b/:c/*" -> "a" | "c" | "*"
   */

  // Attempt to parse the given string segment. If it fails, then just return the
  // plain string type as a default fallback. Otherwise, return the union of the
  // parsed string literals that were referenced as dynamic segments in the route.
  /**
   * The parameters that were parsed from the URL path.
   */
  /**
   * A RouteMatch contains info about how a route matched a URL.
   */
  function isIndexRoute(route) {
    return route.index === true;
  }

  // Walk the route tree generating unique IDs where necessary, so we are working
  // solely with AgnosticDataRouteObject's within the Router
  function convertRoutesToDataRoutes(routes, mapRouteProperties, parentPath, manifest) {
    if (parentPath === void 0) {
      parentPath = [];
    }
    if (manifest === void 0) {
      manifest = {};
    }
    return routes.map((route, index) => {
      let treePath = [...parentPath, index];
      let id = typeof route.id === "string" ? route.id : treePath.join("-");
      invariant(route.index !== true || !route.children, "Cannot specify children on an index route");
      invariant(!manifest[id], "Found a route id collision on id \"" + id + "\".  Route " + "id's must be globally unique within Data Router usages");
      if (isIndexRoute(route)) {
        let indexRoute = _extends({}, route, mapRouteProperties(route), {
          id
        });
        manifest[id] = indexRoute;
        return indexRoute;
      } else {
        let pathOrLayoutRoute = _extends({}, route, mapRouteProperties(route), {
          id,
          children: undefined
        });
        manifest[id] = pathOrLayoutRoute;
        if (route.children) {
          pathOrLayoutRoute.children = convertRoutesToDataRoutes(route.children, mapRouteProperties, treePath, manifest);
        }
        return pathOrLayoutRoute;
      }
    });
  }

  /**
   * Matches the given routes to a location and returns the match data.
   *
   * @see https://reactrouter.com/utils/match-routes
   */
  function matchRoutes(routes, locationArg, basename) {
    if (basename === void 0) {
      basename = "/";
    }
    let location = typeof locationArg === "string" ? parsePath(locationArg) : locationArg;
    let pathname = stripBasename(location.pathname || "/", basename);
    if (pathname == null) {
      return null;
    }
    let branches = flattenRoutes(routes);
    rankRouteBranches(branches);
    let matches = null;
    for (let i = 0; matches == null && i < branches.length; ++i) {
      matches = matchRouteBranch(branches[i],
      // Incoming pathnames are generally encoded from either window.location
      // or from router.navigate, but we want to match against the unencoded
      // paths in the route definitions.  Memory router locations won't be
      // encoded here but there also shouldn't be anything to decode so this
      // should be a safe operation.  This avoids needing matchRoutes to be
      // history-aware.
      safelyDecodeURI(pathname));
    }
    return matches;
  }
  function convertRouteMatchToUiMatch(match, loaderData) {
    let {
      route,
      pathname,
      params
    } = match;
    return {
      id: route.id,
      pathname,
      params,
      data: loaderData[route.id],
      handle: route.handle
    };
  }
  function flattenRoutes(routes, branches, parentsMeta, parentPath) {
    if (branches === void 0) {
      branches = [];
    }
    if (parentsMeta === void 0) {
      parentsMeta = [];
    }
    if (parentPath === void 0) {
      parentPath = "";
    }
    let flattenRoute = (route, index, relativePath) => {
      let meta = {
        relativePath: relativePath === undefined ? route.path || "" : relativePath,
        caseSensitive: route.caseSensitive === true,
        childrenIndex: index,
        route
      };
      if (meta.relativePath.startsWith("/")) {
        invariant(meta.relativePath.startsWith(parentPath), "Absolute route path \"" + meta.relativePath + "\" nested under path " + ("\"" + parentPath + "\" is not valid. An absolute child route path ") + "must start with the combined path of all its parent routes.");
        meta.relativePath = meta.relativePath.slice(parentPath.length);
      }
      let path = joinPaths([parentPath, meta.relativePath]);
      let routesMeta = parentsMeta.concat(meta);

      // Add the children before adding this route to the array, so we traverse the
      // route tree depth-first and child routes appear before their parents in
      // the "flattened" version.
      if (route.children && route.children.length > 0) {
        invariant(
        // Our types know better, but runtime JS may not!
        // @ts-expect-error
        route.index !== true, "Index routes must not have child routes. Please remove " + ("all child routes from route path \"" + path + "\"."));
        flattenRoutes(route.children, branches, routesMeta, path);
      }

      // Routes without a path shouldn't ever match by themselves unless they are
      // index routes, so don't add them to the list of possible branches.
      if (route.path == null && !route.index) {
        return;
      }
      branches.push({
        path,
        score: computeScore(path, route.index),
        routesMeta
      });
    };
    routes.forEach((route, index) => {
      var _route$path;
      // coarse-grain check for optional params
      if (route.path === "" || !((_route$path = route.path) != null && _route$path.includes("?"))) {
        flattenRoute(route, index);
      } else {
        for (let exploded of explodeOptionalSegments(route.path)) {
          flattenRoute(route, index, exploded);
        }
      }
    });
    return branches;
  }

  /**
   * Computes all combinations of optional path segments for a given path,
   * excluding combinations that are ambiguous and of lower priority.
   *
   * For example, `/one/:two?/three/:four?/:five?` explodes to:
   * - `/one/three`
   * - `/one/:two/three`
   * - `/one/three/:four`
   * - `/one/three/:five`
   * - `/one/:two/three/:four`
   * - `/one/:two/three/:five`
   * - `/one/three/:four/:five`
   * - `/one/:two/three/:four/:five`
   */
  function explodeOptionalSegments(path) {
    let segments = path.split("/");
    if (segments.length === 0) return [];
    let [first, ...rest] = segments;

    // Optional path segments are denoted by a trailing `?`
    let isOptional = first.endsWith("?");
    // Compute the corresponding required segment: `foo?` -> `foo`
    let required = first.replace(/\?$/, "");
    if (rest.length === 0) {
      // Intepret empty string as omitting an optional segment
      // `["one", "", "three"]` corresponds to omitting `:two` from `/one/:two?/three` -> `/one/three`
      return isOptional ? [required, ""] : [required];
    }
    let restExploded = explodeOptionalSegments(rest.join("/"));
    let result = [];

    // All child paths with the prefix.  Do this for all children before the
    // optional version for all children, so we get consistent ordering where the
    // parent optional aspect is preferred as required.  Otherwise, we can get
    // child sections interspersed where deeper optional segments are higher than
    // parent optional segments, where for example, /:two would explode _earlier_
    // then /:one.  By always including the parent as required _for all children_
    // first, we avoid this issue
    result.push(...restExploded.map(subpath => subpath === "" ? required : [required, subpath].join("/")));

    // Then, if this is an optional value, add all child versions without
    if (isOptional) {
      result.push(...restExploded);
    }

    // for absolute paths, ensure `/` instead of empty segment
    return result.map(exploded => path.startsWith("/") && exploded === "" ? "/" : exploded);
  }
  function rankRouteBranches(branches) {
    branches.sort((a, b) => a.score !== b.score ? b.score - a.score // Higher score first
    : compareIndexes(a.routesMeta.map(meta => meta.childrenIndex), b.routesMeta.map(meta => meta.childrenIndex)));
  }
  const paramRe = /^:[\w-]+$/;
  const dynamicSegmentValue = 3;
  const indexRouteValue = 2;
  const emptySegmentValue = 1;
  const staticSegmentValue = 10;
  const splatPenalty = -2;
  const isSplat = s => s === "*";
  function computeScore(path, index) {
    let segments = path.split("/");
    let initialScore = segments.length;
    if (segments.some(isSplat)) {
      initialScore += splatPenalty;
    }
    if (index) {
      initialScore += indexRouteValue;
    }
    return segments.filter(s => !isSplat(s)).reduce((score, segment) => score + (paramRe.test(segment) ? dynamicSegmentValue : segment === "" ? emptySegmentValue : staticSegmentValue), initialScore);
  }
  function compareIndexes(a, b) {
    let siblings = a.length === b.length && a.slice(0, -1).every((n, i) => n === b[i]);
    return siblings ?
    // If two routes are siblings, we should try to match the earlier sibling
    // first. This allows people to have fine-grained control over the matching
    // behavior by simply putting routes with identical paths in the order they
    // want them tried.
    a[a.length - 1] - b[b.length - 1] :
    // Otherwise, it doesn't really make sense to rank non-siblings by index,
    // so they sort equally.
    0;
  }
  function matchRouteBranch(branch, pathname) {
    let {
      routesMeta
    } = branch;
    let matchedParams = {};
    let matchedPathname = "/";
    let matches = [];
    for (let i = 0; i < routesMeta.length; ++i) {
      let meta = routesMeta[i];
      let end = i === routesMeta.length - 1;
      let remainingPathname = matchedPathname === "/" ? pathname : pathname.slice(matchedPathname.length) || "/";
      let match = matchPath({
        path: meta.relativePath,
        caseSensitive: meta.caseSensitive,
        end
      }, remainingPathname);
      if (!match) return null;
      Object.assign(matchedParams, match.params);
      let route = meta.route;
      matches.push({
        // TODO: Can this as be avoided?
        params: matchedParams,
        pathname: joinPaths([matchedPathname, match.pathname]),
        pathnameBase: normalizePathname(joinPaths([matchedPathname, match.pathnameBase])),
        route
      });
      if (match.pathnameBase !== "/") {
        matchedPathname = joinPaths([matchedPathname, match.pathnameBase]);
      }
    }
    return matches;
  }

  /**
   * Returns a path with params interpolated.
   *
   * @see https://reactrouter.com/utils/generate-path
   */
  function generatePath(originalPath, params) {
    if (params === void 0) {
      params = {};
    }
    let path = originalPath;
    if (path.endsWith("*") && path !== "*" && !path.endsWith("/*")) {
      warning(false, "Route path \"" + path + "\" will be treated as if it were " + ("\"" + path.replace(/\*$/, "/*") + "\" because the `*` character must ") + "always follow a `/` in the pattern. To get rid of this warning, " + ("please change the route path to \"" + path.replace(/\*$/, "/*") + "\"."));
      path = path.replace(/\*$/, "/*");
    }

    // ensure `/` is added at the beginning if the path is absolute
    const prefix = path.startsWith("/") ? "/" : "";
    const stringify = p => p == null ? "" : typeof p === "string" ? p : String(p);
    const segments = path.split(/\/+/).map((segment, index, array) => {
      const isLastSegment = index === array.length - 1;

      // only apply the splat if it's the last segment
      if (isLastSegment && segment === "*") {
        const star = "*";
        // Apply the splat
        return stringify(params[star]);
      }
      const keyMatch = segment.match(/^:([\w-]+)(\??)$/);
      if (keyMatch) {
        const [, key, optional] = keyMatch;
        let param = params[key];
        invariant(optional === "?" || param != null, "Missing \":" + key + "\" param");
        return stringify(param);
      }

      // Remove any optional markers from optional static segments
      return segment.replace(/\?$/g, "");
    })
    // Remove empty segments
    .filter(segment => !!segment);
    return prefix + segments.join("/");
  }

  /**
   * A PathPattern is used to match on some portion of a URL pathname.
   */

  /**
   * A PathMatch contains info about how a PathPattern matched on a URL pathname.
   */

  /**
   * Performs pattern matching on a URL pathname and returns information about
   * the match.
   *
   * @see https://reactrouter.com/utils/match-path
   */
  function matchPath(pattern, pathname) {
    if (typeof pattern === "string") {
      pattern = {
        path: pattern,
        caseSensitive: false,
        end: true
      };
    }
    let [matcher, compiledParams] = compilePath(pattern.path, pattern.caseSensitive, pattern.end);
    let match = pathname.match(matcher);
    if (!match) return null;
    let matchedPathname = match[0];
    let pathnameBase = matchedPathname.replace(/(.)\/+$/, "$1");
    let captureGroups = match.slice(1);
    let params = compiledParams.reduce((memo, _ref, index) => {
      let {
        paramName,
        isOptional
      } = _ref;
      // We need to compute the pathnameBase here using the raw splat value
      // instead of using params["*"] later because it will be decoded then
      if (paramName === "*") {
        let splatValue = captureGroups[index] || "";
        pathnameBase = matchedPathname.slice(0, matchedPathname.length - splatValue.length).replace(/(.)\/+$/, "$1");
      }
      const value = captureGroups[index];
      if (isOptional && !value) {
        memo[paramName] = undefined;
      } else {
        memo[paramName] = safelyDecodeURIComponent(value || "", paramName);
      }
      return memo;
    }, {});
    return {
      params,
      pathname: matchedPathname,
      pathnameBase,
      pattern
    };
  }
  function compilePath(path, caseSensitive, end) {
    if (caseSensitive === void 0) {
      caseSensitive = false;
    }
    if (end === void 0) {
      end = true;
    }
    warning(path === "*" || !path.endsWith("*") || path.endsWith("/*"), "Route path \"" + path + "\" will be treated as if it were " + ("\"" + path.replace(/\*$/, "/*") + "\" because the `*` character must ") + "always follow a `/` in the pattern. To get rid of this warning, " + ("please change the route path to \"" + path.replace(/\*$/, "/*") + "\"."));
    let params = [];
    let regexpSource = "^" + path.replace(/\/*\*?$/, "") // Ignore trailing / and /*, we'll handle it below
    .replace(/^\/*/, "/") // Make sure it has a leading /
    .replace(/[\\.*+^${}|()[\]]/g, "\\$&") // Escape special regex chars
    .replace(/\/:([\w-]+)(\?)?/g, (_, paramName, isOptional) => {
      params.push({
        paramName,
        isOptional: isOptional != null
      });
      return isOptional ? "/?([^\\/]+)?" : "/([^\\/]+)";
    });
    if (path.endsWith("*")) {
      params.push({
        paramName: "*"
      });
      regexpSource += path === "*" || path === "/*" ? "(.*)$" // Already matched the initial /, just match the rest
      : "(?:\\/(.+)|\\/*)$"; // Don't include the / in params["*"]
    } else if (end) {
      // When matching to the end, ignore trailing slashes
      regexpSource += "\\/*$";
    } else if (path !== "" && path !== "/") {
      // If our path is non-empty and contains anything beyond an initial slash,
      // then we have _some_ form of path in our regex, so we should expect to
      // match only if we find the end of this path segment.  Look for an optional
      // non-captured trailing slash (to match a portion of the URL) or the end
      // of the path (if we've matched to the end).  We used to do this with a
      // word boundary but that gives false positives on routes like
      // /user-preferences since `-` counts as a word boundary.
      regexpSource += "(?:(?=\\/|$))";
    } else ;
    let matcher = new RegExp(regexpSource, caseSensitive ? undefined : "i");
    return [matcher, params];
  }
  function safelyDecodeURI(value) {
    try {
      return decodeURI(value);
    } catch (error) {
      warning(false, "The URL path \"" + value + "\" could not be decoded because it is is a " + "malformed URL segment. This is probably due to a bad percent " + ("encoding (" + error + ")."));
      return value;
    }
  }
  function safelyDecodeURIComponent(value, paramName) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      warning(false, "The value for the URL param \"" + paramName + "\" will not be decoded because" + (" the string \"" + value + "\" is a malformed URL segment. This is probably") + (" due to a bad percent encoding (" + error + ")."));
      return value;
    }
  }

  /**
   * @private
   */
  function stripBasename(pathname, basename) {
    if (basename === "/") return pathname;
    if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) {
      return null;
    }

    // We want to leave trailing slash behavior in the user's control, so if they
    // specify a basename with a trailing slash, we should support it
    let startIndex = basename.endsWith("/") ? basename.length - 1 : basename.length;
    let nextChar = pathname.charAt(startIndex);
    if (nextChar && nextChar !== "/") {
      // pathname does not start with basename/
      return null;
    }
    return pathname.slice(startIndex) || "/";
  }

  /**
   * Returns a resolved path object relative to the given pathname.
   *
   * @see https://reactrouter.com/utils/resolve-path
   */
  function resolvePath(to, fromPathname) {
    if (fromPathname === void 0) {
      fromPathname = "/";
    }
    let {
      pathname: toPathname,
      search = "",
      hash = ""
    } = typeof to === "string" ? parsePath(to) : to;
    let pathname = toPathname ? toPathname.startsWith("/") ? toPathname : resolvePathname(toPathname, fromPathname) : fromPathname;
    return {
      pathname,
      search: normalizeSearch(search),
      hash: normalizeHash(hash)
    };
  }
  function resolvePathname(relativePath, fromPathname) {
    let segments = fromPathname.replace(/\/+$/, "").split("/");
    let relativeSegments = relativePath.split("/");
    relativeSegments.forEach(segment => {
      if (segment === "..") {
        // Keep the root "" segment so the pathname starts at /
        if (segments.length > 1) segments.pop();
      } else if (segment !== ".") {
        segments.push(segment);
      }
    });
    return segments.length > 1 ? segments.join("/") : "/";
  }
  function getInvalidPathError(char, field, dest, path) {
    return "Cannot include a '" + char + "' character in a manually specified " + ("`to." + field + "` field [" + JSON.stringify(path) + "].  Please separate it out to the ") + ("`to." + dest + "` field. Alternatively you may provide the full path as ") + "a string in <Link to=\"...\"> and the router will parse it for you.";
  }

  /**
   * @private
   *
   * When processing relative navigation we want to ignore ancestor routes that
   * do not contribute to the path, such that index/pathless layout routes don't
   * interfere.
   *
   * For example, when moving a route element into an index route and/or a
   * pathless layout route, relative link behavior contained within should stay
   * the same.  Both of the following examples should link back to the root:
   *
   *   <Route path="/">
   *     <Route path="accounts" element={<Link to=".."}>
   *   </Route>
   *
   *   <Route path="/">
   *     <Route path="accounts">
   *       <Route element={<AccountsLayout />}>       // <-- Does not contribute
   *         <Route index element={<Link to=".."} />  // <-- Does not contribute
   *       </Route
   *     </Route>
   *   </Route>
   */
  function getPathContributingMatches(matches) {
    return matches.filter((match, index) => index === 0 || match.route.path && match.route.path.length > 0);
  }

  // Return the array of pathnames for the current route matches - used to
  // generate the routePathnames input for resolveTo()
  function getResolveToMatches(matches, v7_relativeSplatPath) {
    let pathMatches = getPathContributingMatches(matches);

    // When v7_relativeSplatPath is enabled, use the full pathname for the leaf
    // match so we include splat values for "." links.  See:
    // https://github.com/remix-run/react-router/issues/11052#issuecomment-1836589329
    if (v7_relativeSplatPath) {
      return pathMatches.map((match, idx) => idx === matches.length - 1 ? match.pathname : match.pathnameBase);
    }
    return pathMatches.map(match => match.pathnameBase);
  }

  /**
   * @private
   */
  function resolveTo(toArg, routePathnames, locationPathname, isPathRelative) {
    if (isPathRelative === void 0) {
      isPathRelative = false;
    }
    let to;
    if (typeof toArg === "string") {
      to = parsePath(toArg);
    } else {
      to = _extends({}, toArg);
      invariant(!to.pathname || !to.pathname.includes("?"), getInvalidPathError("?", "pathname", "search", to));
      invariant(!to.pathname || !to.pathname.includes("#"), getInvalidPathError("#", "pathname", "hash", to));
      invariant(!to.search || !to.search.includes("#"), getInvalidPathError("#", "search", "hash", to));
    }
    let isEmptyPath = toArg === "" || to.pathname === "";
    let toPathname = isEmptyPath ? "/" : to.pathname;
    let from;

    // Routing is relative to the current pathname if explicitly requested.
    //
    // If a pathname is explicitly provided in `to`, it should be relative to the
    // route context. This is explained in `Note on `<Link to>` values` in our
    // migration guide from v5 as a means of disambiguation between `to` values
    // that begin with `/` and those that do not. However, this is problematic for
    // `to` values that do not provide a pathname. `to` can simply be a search or
    // hash string, in which case we should assume that the navigation is relative
    // to the current location's pathname and *not* the route pathname.
    if (toPathname == null) {
      from = locationPathname;
    } else {
      let routePathnameIndex = routePathnames.length - 1;

      // With relative="route" (the default), each leading .. segment means
      // "go up one route" instead of "go up one URL segment".  This is a key
      // difference from how <a href> works and a major reason we call this a
      // "to" value instead of a "href".
      if (!isPathRelative && toPathname.startsWith("..")) {
        let toSegments = toPathname.split("/");
        while (toSegments[0] === "..") {
          toSegments.shift();
          routePathnameIndex -= 1;
        }
        to.pathname = toSegments.join("/");
      }
      from = routePathnameIndex >= 0 ? routePathnames[routePathnameIndex] : "/";
    }
    let path = resolvePath(to, from);

    // Ensure the pathname has a trailing slash if the original "to" had one
    let hasExplicitTrailingSlash = toPathname && toPathname !== "/" && toPathname.endsWith("/");
    // Or if this was a link to the current path which has a trailing slash
    let hasCurrentTrailingSlash = (isEmptyPath || toPathname === ".") && locationPathname.endsWith("/");
    if (!path.pathname.endsWith("/") && (hasExplicitTrailingSlash || hasCurrentTrailingSlash)) {
      path.pathname += "/";
    }
    return path;
  }

  /**
   * @private
   */
  function getToPathname(to) {
    // Empty strings should be treated the same as / paths
    return to === "" || to.pathname === "" ? "/" : typeof to === "string" ? parsePath(to).pathname : to.pathname;
  }

  /**
   * @private
   */
  const joinPaths = paths => paths.join("/").replace(/\/\/+/g, "/");

  /**
   * @private
   */
  const normalizePathname = pathname => pathname.replace(/\/+$/, "").replace(/^\/*/, "/");

  /**
   * @private
   */
  const normalizeSearch = search => !search || search === "?" ? "" : search.startsWith("?") ? search : "?" + search;

  /**
   * @private
   */
  const normalizeHash = hash => !hash || hash === "#" ? "" : hash.startsWith("#") ? hash : "#" + hash;
  /**
   * This is a shortcut for creating `application/json` responses. Converts `data`
   * to JSON and sets the `Content-Type` header.
   */
  const json = function json(data, init) {
    if (init === void 0) {
      init = {};
    }
    let responseInit = typeof init === "number" ? {
      status: init
    } : init;
    let headers = new Headers(responseInit.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }
    return new Response(JSON.stringify(data), _extends({}, responseInit, {
      headers
    }));
  };
  class AbortedDeferredError extends Error {}
  class DeferredData {
    constructor(data, responseInit) {
      this.pendingKeysSet = new Set();
      this.subscribers = new Set();
      this.deferredKeys = [];
      invariant(data && typeof data === "object" && !Array.isArray(data), "defer() only accepts plain objects");

      // Set up an AbortController + Promise we can race against to exit early
      // cancellation
      let reject;
      this.abortPromise = new Promise((_, r) => reject = r);
      this.controller = new AbortController();
      let onAbort = () => reject(new AbortedDeferredError("Deferred data aborted"));
      this.unlistenAbortSignal = () => this.controller.signal.removeEventListener("abort", onAbort);
      this.controller.signal.addEventListener("abort", onAbort);
      this.data = Object.entries(data).reduce((acc, _ref2) => {
        let [key, value] = _ref2;
        return Object.assign(acc, {
          [key]: this.trackPromise(key, value)
        });
      }, {});
      if (this.done) {
        // All incoming values were resolved
        this.unlistenAbortSignal();
      }
      this.init = responseInit;
    }
    trackPromise(key, value) {
      if (!(value instanceof Promise)) {
        return value;
      }
      this.deferredKeys.push(key);
      this.pendingKeysSet.add(key);

      // We store a little wrapper promise that will be extended with
      // _data/_error props upon resolve/reject
      let promise = Promise.race([value, this.abortPromise]).then(data => this.onSettle(promise, key, undefined, data), error => this.onSettle(promise, key, error));

      // Register rejection listeners to avoid uncaught promise rejections on
      // errors or aborted deferred values
      promise.catch(() => {});
      Object.defineProperty(promise, "_tracked", {
        get: () => true
      });
      return promise;
    }
    onSettle(promise, key, error, data) {
      if (this.controller.signal.aborted && error instanceof AbortedDeferredError) {
        this.unlistenAbortSignal();
        Object.defineProperty(promise, "_error", {
          get: () => error
        });
        return Promise.reject(error);
      }
      this.pendingKeysSet.delete(key);
      if (this.done) {
        // Nothing left to abort!
        this.unlistenAbortSignal();
      }

      // If the promise was resolved/rejected with undefined, we'll throw an error as you
      // should always resolve with a value or null
      if (error === undefined && data === undefined) {
        let undefinedError = new Error("Deferred data for key \"" + key + "\" resolved/rejected with `undefined`, " + "you must resolve/reject with a value or `null`.");
        Object.defineProperty(promise, "_error", {
          get: () => undefinedError
        });
        this.emit(false, key);
        return Promise.reject(undefinedError);
      }
      if (data === undefined) {
        Object.defineProperty(promise, "_error", {
          get: () => error
        });
        this.emit(false, key);
        return Promise.reject(error);
      }
      Object.defineProperty(promise, "_data", {
        get: () => data
      });
      this.emit(false, key);
      return data;
    }
    emit(aborted, settledKey) {
      this.subscribers.forEach(subscriber => subscriber(aborted, settledKey));
    }
    subscribe(fn) {
      this.subscribers.add(fn);
      return () => this.subscribers.delete(fn);
    }
    cancel() {
      this.controller.abort();
      this.pendingKeysSet.forEach((v, k) => this.pendingKeysSet.delete(k));
      this.emit(true);
    }
    async resolveData(signal) {
      let aborted = false;
      if (!this.done) {
        let onAbort = () => this.cancel();
        signal.addEventListener("abort", onAbort);
        aborted = await new Promise(resolve => {
          this.subscribe(aborted => {
            signal.removeEventListener("abort", onAbort);
            if (aborted || this.done) {
              resolve(aborted);
            }
          });
        });
      }
      return aborted;
    }
    get done() {
      return this.pendingKeysSet.size === 0;
    }
    get unwrappedData() {
      invariant(this.data !== null && this.done, "Can only unwrap data on initialized and settled deferreds");
      return Object.entries(this.data).reduce((acc, _ref3) => {
        let [key, value] = _ref3;
        return Object.assign(acc, {
          [key]: unwrapTrackedPromise(value)
        });
      }, {});
    }
    get pendingKeys() {
      return Array.from(this.pendingKeysSet);
    }
  }
  function isTrackedPromise(value) {
    return value instanceof Promise && value._tracked === true;
  }
  function unwrapTrackedPromise(value) {
    if (!isTrackedPromise(value)) {
      return value;
    }
    if (value._error) {
      throw value._error;
    }
    return value._data;
  }
  const defer = function defer(data, init) {
    if (init === void 0) {
      init = {};
    }
    let responseInit = typeof init === "number" ? {
      status: init
    } : init;
    return new DeferredData(data, responseInit);
  };
  /**
   * A redirect response. Sets the status code and the `Location` header.
   * Defaults to "302 Found".
   */
  const redirect = function redirect(url, init) {
    if (init === void 0) {
      init = 302;
    }
    let responseInit = init;
    if (typeof responseInit === "number") {
      responseInit = {
        status: responseInit
      };
    } else if (typeof responseInit.status === "undefined") {
      responseInit.status = 302;
    }
    let headers = new Headers(responseInit.headers);
    headers.set("Location", url);
    return new Response(null, _extends({}, responseInit, {
      headers
    }));
  };

  /**
   * A redirect response that will force a document reload to the new location.
   * Sets the status code and the `Location` header.
   * Defaults to "302 Found".
   */
  const redirectDocument = (url, init) => {
    let response = redirect(url, init);
    response.headers.set("X-Remix-Reload-Document", "true");
    return response;
  };
  /**
   * @private
   * Utility class we use to hold auto-unwrapped 4xx/5xx Response bodies
   *
   * We don't export the class for public use since it's an implementation
   * detail, but we export the interface above so folks can build their own
   * abstractions around instances via isRouteErrorResponse()
   */
  class ErrorResponseImpl {
    constructor(status, statusText, data, internal) {
      if (internal === void 0) {
        internal = false;
      }
      this.status = status;
      this.statusText = statusText || "";
      this.internal = internal;
      if (data instanceof Error) {
        this.data = data.toString();
        this.error = data;
      } else {
        this.data = data;
      }
    }
  }

  /**
   * Check if the given error is an ErrorResponse generated from a 4xx/5xx
   * Response thrown from an action/loader
   */
  function isRouteErrorResponse(error) {
    return error != null && typeof error.status === "number" && typeof error.statusText === "string" && typeof error.internal === "boolean" && "data" in error;
  }

  ////////////////////////////////////////////////////////////////////////////////
  //#region Types and Constants
  ////////////////////////////////////////////////////////////////////////////////

  /**
   * A Router instance manages all navigation and data loading/mutations
   */
  /**
   * State maintained internally by the router.  During a navigation, all states
   * reflect the the "old" location unless otherwise noted.
   */
  /**
   * Data that can be passed into hydrate a Router from SSR
   */
  /**
   * Future flags to toggle new feature behavior
   */
  /**
   * Initialization options for createRouter
   */
  /**
   * State returned from a server-side query() call
   */
  /**
   * A StaticHandler instance manages a singular SSR navigation/fetch event
   */
  /**
   * Subscriber function signature for changes to router state
   */
  /**
   * Function signature for determining the key to be used in scroll restoration
   * for a given location
   */
  /**
   * Function signature for determining the current scroll position
   */
  // Allowed for any navigation or fetch
  // Only allowed for navigations
  // Only allowed for submission navigations
  /**
   * Options for a navigate() call for a normal (non-submission) navigation
   */
  /**
   * Options for a navigate() call for a submission navigation
   */
  /**
   * Options to pass to navigate() for a navigation
   */
  /**
   * Options for a fetch() load
   */
  /**
   * Options for a fetch() submission
   */
  /**
   * Options to pass to fetch()
   */
  /**
   * Potential states for state.navigation
   */
  /**
   * Potential states for fetchers
   */
  /**
   * Cached info for active fetcher.load() instances so they can participate
   * in revalidation
   */
  /**
   * Identified fetcher.load() calls that need to be revalidated
   */
  /**
   * Wrapper object to allow us to throw any response out from callLoaderOrAction
   * for queryRouter while preserving whether or not it was thrown or returned
   * from the loader/action
   */
  const validMutationMethodsArr = ["post", "put", "patch", "delete"];
  const validMutationMethods = new Set(validMutationMethodsArr);
  const validRequestMethodsArr = ["get", ...validMutationMethodsArr];
  const validRequestMethods = new Set(validRequestMethodsArr);
  const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
  const redirectPreserveMethodStatusCodes = new Set([307, 308]);
  const IDLE_NAVIGATION = {
    state: "idle",
    location: undefined,
    formMethod: undefined,
    formAction: undefined,
    formEncType: undefined,
    formData: undefined,
    json: undefined,
    text: undefined
  };
  const IDLE_FETCHER = {
    state: "idle",
    data: undefined,
    formMethod: undefined,
    formAction: undefined,
    formEncType: undefined,
    formData: undefined,
    json: undefined,
    text: undefined
  };
  const IDLE_BLOCKER = {
    state: "unblocked",
    proceed: undefined,
    reset: undefined,
    location: undefined
  };
  const ABSOLUTE_URL_REGEX = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
  const defaultMapRouteProperties = route => ({
    hasErrorBoundary: Boolean(route.hasErrorBoundary)
  });
  const TRANSITIONS_STORAGE_KEY = "remix-router-transitions";

  //#endregion

  ////////////////////////////////////////////////////////////////////////////////
  //#region createRouter
  ////////////////////////////////////////////////////////////////////////////////

  /**
   * Create a router and listen to history POP navigations
   */
  function createRouter(init) {
    const routerWindow = init.window ? init.window : typeof window !== "undefined" ? window : undefined;
    const isBrowser = typeof routerWindow !== "undefined" && typeof routerWindow.document !== "undefined" && typeof routerWindow.document.createElement !== "undefined";
    const isServer = !isBrowser;
    invariant(init.routes.length > 0, "You must provide a non-empty routes array to createRouter");
    let mapRouteProperties;
    if (init.mapRouteProperties) {
      mapRouteProperties = init.mapRouteProperties;
    } else if (init.detectErrorBoundary) {
      // If they are still using the deprecated version, wrap it with the new API
      let detectErrorBoundary = init.detectErrorBoundary;
      mapRouteProperties = route => ({
        hasErrorBoundary: detectErrorBoundary(route)
      });
    } else {
      mapRouteProperties = defaultMapRouteProperties;
    }

    // Routes keyed by ID
    let manifest = {};
    // Routes in tree format for matching
    let dataRoutes = convertRoutesToDataRoutes(init.routes, mapRouteProperties, undefined, manifest);
    let inFlightDataRoutes;
    let basename = init.basename || "/";
    // Config driven behavior flags
    let future = _extends({
      v7_fetcherPersist: false,
      v7_normalizeFormMethod: false,
      v7_partialHydration: false,
      v7_prependBasename: false,
      v7_relativeSplatPath: false
    }, init.future);
    // Cleanup function for history
    let unlistenHistory = null;
    // Externally-provided functions to call on all state changes
    let subscribers = new Set();
    // Externally-provided object to hold scroll restoration locations during routing
    let savedScrollPositions = null;
    // Externally-provided function to get scroll restoration keys
    let getScrollRestorationKey = null;
    // Externally-provided function to get current scroll position
    let getScrollPosition = null;
    // One-time flag to control the initial hydration scroll restoration.  Because
    // we don't get the saved positions from <ScrollRestoration /> until _after_
    // the initial render, we need to manually trigger a separate updateState to
    // send along the restoreScrollPosition
    // Set to true if we have `hydrationData` since we assume we were SSR'd and that
    // SSR did the initial scroll restoration.
    let initialScrollRestored = init.hydrationData != null;
    let initialMatches = matchRoutes(dataRoutes, init.history.location, basename);
    let initialErrors = null;
    if (initialMatches == null) {
      // If we do not match a user-provided-route, fall back to the root
      // to allow the error boundary to take over
      let error = getInternalRouterError(404, {
        pathname: init.history.location.pathname
      });
      let {
        matches,
        route
      } = getShortCircuitMatches(dataRoutes);
      initialMatches = matches;
      initialErrors = {
        [route.id]: error
      };
    }
    let initialized;
    let hasLazyRoutes = initialMatches.some(m => m.route.lazy);
    let hasLoaders = initialMatches.some(m => m.route.loader);
    if (hasLazyRoutes) {
      // All initialMatches need to be loaded before we're ready.  If we have lazy
      // functions around still then we'll need to run them in initialize()
      initialized = false;
    } else if (!hasLoaders) {
      // If we've got no loaders to run, then we're good to go
      initialized = true;
    } else if (future.v7_partialHydration) {
      // If partial hydration is enabled, we're initialized so long as we were
      // provided with hydrationData for every route with a loader, and no loaders
      // were marked for explicit hydration
      let loaderData = init.hydrationData ? init.hydrationData.loaderData : null;
      let errors = init.hydrationData ? init.hydrationData.errors : null;
      initialized = initialMatches.every(m => m.route.loader && m.route.loader.hydrate !== true && (loaderData && loaderData[m.route.id] !== undefined || errors && errors[m.route.id] !== undefined));
    } else {
      // Without partial hydration - we're initialized if we were provided any
      // hydrationData - which is expected to be complete
      initialized = init.hydrationData != null;
    }
    let router;
    let state = {
      historyAction: init.history.action,
      location: init.history.location,
      matches: initialMatches,
      initialized,
      navigation: IDLE_NAVIGATION,
      // Don't restore on initial updateState() if we were SSR'd
      restoreScrollPosition: init.hydrationData != null ? false : null,
      preventScrollReset: false,
      revalidation: "idle",
      loaderData: init.hydrationData && init.hydrationData.loaderData || {},
      actionData: init.hydrationData && init.hydrationData.actionData || null,
      errors: init.hydrationData && init.hydrationData.errors || initialErrors,
      fetchers: new Map(),
      blockers: new Map()
    };

    // -- Stateful internal variables to manage navigations --
    // Current navigation in progress (to be committed in completeNavigation)
    let pendingAction = Action.Pop;

    // Should the current navigation prevent the scroll reset if scroll cannot
    // be restored?
    let pendingPreventScrollReset = false;

    // AbortController for the active navigation
    let pendingNavigationController;

    // Should the current navigation enable document.startViewTransition?
    let pendingViewTransitionEnabled = false;

    // Store applied view transitions so we can apply them on POP
    let appliedViewTransitions = new Map();

    // Cleanup function for persisting applied transitions to sessionStorage
    let removePageHideEventListener = null;

    // We use this to avoid touching history in completeNavigation if a
    // revalidation is entirely uninterrupted
    let isUninterruptedRevalidation = false;

    // Use this internal flag to force revalidation of all loaders:
    //  - submissions (completed or interrupted)
    //  - useRevalidator()
    //  - X-Remix-Revalidate (from redirect)
    let isRevalidationRequired = false;

    // Use this internal array to capture routes that require revalidation due
    // to a cancelled deferred on action submission
    let cancelledDeferredRoutes = [];

    // Use this internal array to capture fetcher loads that were cancelled by an
    // action navigation and require revalidation
    let cancelledFetcherLoads = [];

    // AbortControllers for any in-flight fetchers
    let fetchControllers = new Map();

    // Track loads based on the order in which they started
    let incrementingLoadId = 0;

    // Track the outstanding pending navigation data load to be compared against
    // the globally incrementing load when a fetcher load lands after a completed
    // navigation
    let pendingNavigationLoadId = -1;

    // Fetchers that triggered data reloads as a result of their actions
    let fetchReloadIds = new Map();

    // Fetchers that triggered redirect navigations
    let fetchRedirectIds = new Set();

    // Most recent href/match for fetcher.load calls for fetchers
    let fetchLoadMatches = new Map();

    // Ref-count mounted fetchers so we know when it's ok to clean them up
    let activeFetchers = new Map();

    // Fetchers that have requested a delete when using v7_fetcherPersist,
    // they'll be officially removed after they return to idle
    let deletedFetchers = new Set();

    // Store DeferredData instances for active route matches.  When a
    // route loader returns defer() we stick one in here.  Then, when a nested
    // promise resolves we update loaderData.  If a new navigation starts we
    // cancel active deferreds for eliminated routes.
    let activeDeferreds = new Map();

    // Store blocker functions in a separate Map outside of router state since
    // we don't need to update UI state if they change
    let blockerFunctions = new Map();

    // Flag to ignore the next history update, so we can revert the URL change on
    // a POP navigation that was blocked by the user without touching router state
    let ignoreNextHistoryUpdate = false;

    // Initialize the router, all side effects should be kicked off from here.
    // Implemented as a Fluent API for ease of:
    //   let router = createRouter(init).initialize();
    function initialize() {
      // If history informs us of a POP navigation, start the navigation but do not update
      // state.  We'll update our own state once the navigation completes
      unlistenHistory = init.history.listen(_ref => {
        let {
          action: historyAction,
          location,
          delta
        } = _ref;
        // Ignore this event if it was just us resetting the URL from a
        // blocked POP navigation
        if (ignoreNextHistoryUpdate) {
          ignoreNextHistoryUpdate = false;
          return;
        }
        warning(blockerFunctions.size === 0 || delta != null, "You are trying to use a blocker on a POP navigation to a location " + "that was not created by @remix-run/router. This will fail silently in " + "production. This can happen if you are navigating outside the router " + "via `window.history.pushState`/`window.location.hash` instead of using " + "router navigation APIs.  This can also happen if you are using " + "createHashRouter and the user manually changes the URL.");
        let blockerKey = shouldBlockNavigation({
          currentLocation: state.location,
          nextLocation: location,
          historyAction
        });
        if (blockerKey && delta != null) {
          // Restore the URL to match the current UI, but don't update router state
          ignoreNextHistoryUpdate = true;
          init.history.go(delta * -1);

          // Put the blocker into a blocked state
          updateBlocker(blockerKey, {
            state: "blocked",
            location,
            proceed() {
              updateBlocker(blockerKey, {
                state: "proceeding",
                proceed: undefined,
                reset: undefined,
                location
              });
              // Re-do the same POP navigation we just blocked
              init.history.go(delta);
            },
            reset() {
              let blockers = new Map(state.blockers);
              blockers.set(blockerKey, IDLE_BLOCKER);
              updateState({
                blockers
              });
            }
          });
          return;
        }
        return startNavigation(historyAction, location);
      });
      if (isBrowser) {
        // FIXME: This feels gross.  How can we cleanup the lines between
        // scrollRestoration/appliedTransitions persistance?
        restoreAppliedTransitions(routerWindow, appliedViewTransitions);
        let _saveAppliedTransitions = () => persistAppliedTransitions(routerWindow, appliedViewTransitions);
        routerWindow.addEventListener("pagehide", _saveAppliedTransitions);
        removePageHideEventListener = () => routerWindow.removeEventListener("pagehide", _saveAppliedTransitions);
      }

      // Kick off initial data load if needed.  Use Pop to avoid modifying history
      // Note we don't do any handling of lazy here.  For SPA's it'll get handled
      // in the normal navigation flow.  For SSR it's expected that lazy modules are
      // resolved prior to router creation since we can't go into a fallbackElement
      // UI for SSR'd apps
      if (!state.initialized) {
        startNavigation(Action.Pop, state.location, {
          initialHydration: true
        });
      }
      return router;
    }

    // Clean up a router and it's side effects
    function dispose() {
      if (unlistenHistory) {
        unlistenHistory();
      }
      if (removePageHideEventListener) {
        removePageHideEventListener();
      }
      subscribers.clear();
      pendingNavigationController && pendingNavigationController.abort();
      state.fetchers.forEach((_, key) => deleteFetcher(key));
      state.blockers.forEach((_, key) => deleteBlocker(key));
    }

    // Subscribe to state updates for the router
    function subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }

    // Update our state and notify the calling context of the change
    function updateState(newState, opts) {
      if (opts === void 0) {
        opts = {};
      }
      state = _extends({}, state, newState);

      // Prep fetcher cleanup so we can tell the UI which fetcher data entries
      // can be removed
      let completedFetchers = [];
      let deletedFetchersKeys = [];
      if (future.v7_fetcherPersist) {
        state.fetchers.forEach((fetcher, key) => {
          if (fetcher.state === "idle") {
            if (deletedFetchers.has(key)) {
              // Unmounted from the UI and can be totally removed
              deletedFetchersKeys.push(key);
            } else {
              // Returned to idle but still mounted in the UI, so semi-remains for
              // revalidations and such
              completedFetchers.push(key);
            }
          }
        });
      }

      // Iterate over a local copy so that if flushSync is used and we end up
      // removing and adding a new subscriber due to the useCallback dependencies,
      // we don't get ourselves into a loop calling the new subscriber immediately
      [...subscribers].forEach(subscriber => subscriber(state, {
        deletedFetchers: deletedFetchersKeys,
        unstable_viewTransitionOpts: opts.viewTransitionOpts,
        unstable_flushSync: opts.flushSync === true
      }));

      // Remove idle fetchers from state since we only care about in-flight fetchers.
      if (future.v7_fetcherPersist) {
        completedFetchers.forEach(key => state.fetchers.delete(key));
        deletedFetchersKeys.forEach(key => deleteFetcher(key));
      }
    }

    // Complete a navigation returning the state.navigation back to the IDLE_NAVIGATION
    // and setting state.[historyAction/location/matches] to the new route.
    // - Location is a required param
    // - Navigation will always be set to IDLE_NAVIGATION
    // - Can pass any other state in newState
    function completeNavigation(location, newState, _temp) {
      var _location$state, _location$state2;
      let {
        flushSync
      } = _temp === void 0 ? {} : _temp;
      // Deduce if we're in a loading/actionReload state:
      // - We have committed actionData in the store
      // - The current navigation was a mutation submission
      // - We're past the submitting state and into the loading state
      // - The location being loaded is not the result of a redirect
      let isActionReload = state.actionData != null && state.navigation.formMethod != null && isMutationMethod(state.navigation.formMethod) && state.navigation.state === "loading" && ((_location$state = location.state) == null ? void 0 : _location$state._isRedirect) !== true;
      let actionData;
      if (newState.actionData) {
        if (Object.keys(newState.actionData).length > 0) {
          actionData = newState.actionData;
        } else {
          // Empty actionData -> clear prior actionData due to an action error
          actionData = null;
        }
      } else if (isActionReload) {
        // Keep the current data if we're wrapping up the action reload
        actionData = state.actionData;
      } else {
        // Clear actionData on any other completed navigations
        actionData = null;
      }

      // Always preserve any existing loaderData from re-used routes
      let loaderData = newState.loaderData ? mergeLoaderData(state.loaderData, newState.loaderData, newState.matches || [], newState.errors) : state.loaderData;

      // On a successful navigation we can assume we got through all blockers
      // so we can start fresh
      let blockers = state.blockers;
      if (blockers.size > 0) {
        blockers = new Map(blockers);
        blockers.forEach((_, k) => blockers.set(k, IDLE_BLOCKER));
      }

      // Always respect the user flag.  Otherwise don't reset on mutation
      // submission navigations unless they redirect
      let preventScrollReset = pendingPreventScrollReset === true || state.navigation.formMethod != null && isMutationMethod(state.navigation.formMethod) && ((_location$state2 = location.state) == null ? void 0 : _location$state2._isRedirect) !== true;
      if (inFlightDataRoutes) {
        dataRoutes = inFlightDataRoutes;
        inFlightDataRoutes = undefined;
      }
      if (isUninterruptedRevalidation) ; else if (pendingAction === Action.Pop) ; else if (pendingAction === Action.Push) {
        init.history.push(location, location.state);
      } else if (pendingAction === Action.Replace) {
        init.history.replace(location, location.state);
      }
      let viewTransitionOpts;

      // On POP, enable transitions if they were enabled on the original navigation
      if (pendingAction === Action.Pop) {
        // Forward takes precedence so they behave like the original navigation
        let priorPaths = appliedViewTransitions.get(state.location.pathname);
        if (priorPaths && priorPaths.has(location.pathname)) {
          viewTransitionOpts = {
            currentLocation: state.location,
            nextLocation: location
          };
        } else if (appliedViewTransitions.has(location.pathname)) {
          // If we don't have a previous forward nav, assume we're popping back to
          // the new location and enable if that location previously enabled
          viewTransitionOpts = {
            currentLocation: location,
            nextLocation: state.location
          };
        }
      } else if (pendingViewTransitionEnabled) {
        // Store the applied transition on PUSH/REPLACE
        let toPaths = appliedViewTransitions.get(state.location.pathname);
        if (toPaths) {
          toPaths.add(location.pathname);
        } else {
          toPaths = new Set([location.pathname]);
          appliedViewTransitions.set(state.location.pathname, toPaths);
        }
        viewTransitionOpts = {
          currentLocation: state.location,
          nextLocation: location
        };
      }
      updateState(_extends({}, newState, {
        // matches, errors, fetchers go through as-is
        actionData,
        loaderData,
        historyAction: pendingAction,
        location,
        initialized: true,
        navigation: IDLE_NAVIGATION,
        revalidation: "idle",
        restoreScrollPosition: getSavedScrollPosition(location, newState.matches || state.matches),
        preventScrollReset,
        blockers
      }), {
        viewTransitionOpts,
        flushSync: flushSync === true
      });

      // Reset stateful navigation vars
      pendingAction = Action.Pop;
      pendingPreventScrollReset = false;
      pendingViewTransitionEnabled = false;
      isUninterruptedRevalidation = false;
      isRevalidationRequired = false;
      cancelledDeferredRoutes = [];
      cancelledFetcherLoads = [];
    }

    // Trigger a navigation event, which can either be a numerical POP or a PUSH
    // replace with an optional submission
    async function navigate(to, opts) {
      if (typeof to === "number") {
        init.history.go(to);
        return;
      }
      let normalizedPath = normalizeTo(state.location, state.matches, basename, future.v7_prependBasename, to, future.v7_relativeSplatPath, opts == null ? void 0 : opts.fromRouteId, opts == null ? void 0 : opts.relative);
      let {
        path,
        submission,
        error
      } = normalizeNavigateOptions(future.v7_normalizeFormMethod, false, normalizedPath, opts);
      let currentLocation = state.location;
      let nextLocation = createLocation(state.location, path, opts && opts.state);

      // When using navigate as a PUSH/REPLACE we aren't reading an already-encoded
      // URL from window.location, so we need to encode it here so the behavior
      // remains the same as POP and non-data-router usages.  new URL() does all
      // the same encoding we'd get from a history.pushState/window.location read
      // without having to touch history
      nextLocation = _extends({}, nextLocation, init.history.encodeLocation(nextLocation));
      let userReplace = opts && opts.replace != null ? opts.replace : undefined;
      let historyAction = Action.Push;
      if (userReplace === true) {
        historyAction = Action.Replace;
      } else if (userReplace === false) ; else if (submission != null && isMutationMethod(submission.formMethod) && submission.formAction === state.location.pathname + state.location.search) {
        // By default on submissions to the current location we REPLACE so that
        // users don't have to double-click the back button to get to the prior
        // location.  If the user redirects to a different location from the
        // action/loader this will be ignored and the redirect will be a PUSH
        historyAction = Action.Replace;
      }
      let preventScrollReset = opts && "preventScrollReset" in opts ? opts.preventScrollReset === true : undefined;
      let flushSync = (opts && opts.unstable_flushSync) === true;
      let blockerKey = shouldBlockNavigation({
        currentLocation,
        nextLocation,
        historyAction
      });
      if (blockerKey) {
        // Put the blocker into a blocked state
        updateBlocker(blockerKey, {
          state: "blocked",
          location: nextLocation,
          proceed() {
            updateBlocker(blockerKey, {
              state: "proceeding",
              proceed: undefined,
              reset: undefined,
              location: nextLocation
            });
            // Send the same navigation through
            navigate(to, opts);
          },
          reset() {
            let blockers = new Map(state.blockers);
            blockers.set(blockerKey, IDLE_BLOCKER);
            updateState({
              blockers
            });
          }
        });
        return;
      }
      return await startNavigation(historyAction, nextLocation, {
        submission,
        // Send through the formData serialization error if we have one so we can
        // render at the right error boundary after we match routes
        pendingError: error,
        preventScrollReset,
        replace: opts && opts.replace,
        enableViewTransition: opts && opts.unstable_viewTransition,
        flushSync
      });
    }

    // Revalidate all current loaders.  If a navigation is in progress or if this
    // is interrupted by a navigation, allow this to "succeed" by calling all
    // loaders during the next loader round
    function revalidate() {
      interruptActiveLoads();
      updateState({
        revalidation: "loading"
      });

      // If we're currently submitting an action, we don't need to start a new
      // navigation, we'll just let the follow up loader execution call all loaders
      if (state.navigation.state === "submitting") {
        return;
      }

      // If we're currently in an idle state, start a new navigation for the current
      // action/location and mark it as uninterrupted, which will skip the history
      // update in completeNavigation
      if (state.navigation.state === "idle") {
        startNavigation(state.historyAction, state.location, {
          startUninterruptedRevalidation: true
        });
        return;
      }

      // Otherwise, if we're currently in a loading state, just start a new
      // navigation to the navigation.location but do not trigger an uninterrupted
      // revalidation so that history correctly updates once the navigation completes
      startNavigation(pendingAction || state.historyAction, state.navigation.location, {
        overrideNavigation: state.navigation
      });
    }

    // Start a navigation to the given action/location.  Can optionally provide a
    // overrideNavigation which will override the normalLoad in the case of a redirect
    // navigation
    async function startNavigation(historyAction, location, opts) {
      // Abort any in-progress navigations and start a new one. Unset any ongoing
      // uninterrupted revalidations unless told otherwise, since we want this
      // new navigation to update history normally
      pendingNavigationController && pendingNavigationController.abort();
      pendingNavigationController = null;
      pendingAction = historyAction;
      isUninterruptedRevalidation = (opts && opts.startUninterruptedRevalidation) === true;

      // Save the current scroll position every time we start a new navigation,
      // and track whether we should reset scroll on completion
      saveScrollPosition(state.location, state.matches);
      pendingPreventScrollReset = (opts && opts.preventScrollReset) === true;
      pendingViewTransitionEnabled = (opts && opts.enableViewTransition) === true;
      let routesToUse = inFlightDataRoutes || dataRoutes;
      let loadingNavigation = opts && opts.overrideNavigation;
      let matches = matchRoutes(routesToUse, location, basename);
      let flushSync = (opts && opts.flushSync) === true;

      // Short circuit with a 404 on the root error boundary if we match nothing
      if (!matches) {
        let error = getInternalRouterError(404, {
          pathname: location.pathname
        });
        let {
          matches: notFoundMatches,
          route
        } = getShortCircuitMatches(routesToUse);
        // Cancel all pending deferred on 404s since we don't keep any routes
        cancelActiveDeferreds();
        completeNavigation(location, {
          matches: notFoundMatches,
          loaderData: {},
          errors: {
            [route.id]: error
          }
        }, {
          flushSync
        });
        return;
      }

      // Short circuit if it's only a hash change and not a revalidation or
      // mutation submission.
      //
      // Ignore on initial page loads because since the initial load will always
      // be "same hash".  For example, on /page#hash and submit a <Form method="post">
      // which will default to a navigation to /page
      if (state.initialized && !isRevalidationRequired && isHashChangeOnly(state.location, location) && !(opts && opts.submission && isMutationMethod(opts.submission.formMethod))) {
        completeNavigation(location, {
          matches
        }, {
          flushSync
        });
        return;
      }

      // Create a controller/Request for this navigation
      pendingNavigationController = new AbortController();
      let request = createClientSideRequest(init.history, location, pendingNavigationController.signal, opts && opts.submission);
      let pendingActionData;
      let pendingError;
      if (opts && opts.pendingError) {
        // If we have a pendingError, it means the user attempted a GET submission
        // with binary FormData so assign here and skip to handleLoaders.  That
        // way we handle calling loaders above the boundary etc.  It's not really
        // different from an actionError in that sense.
        pendingError = {
          [findNearestBoundary(matches).route.id]: opts.pendingError
        };
      } else if (opts && opts.submission && isMutationMethod(opts.submission.formMethod)) {
        // Call action if we received an action submission
        let actionOutput = await handleAction(request, location, opts.submission, matches, {
          replace: opts.replace,
          flushSync
        });
        if (actionOutput.shortCircuited) {
          return;
        }
        pendingActionData = actionOutput.pendingActionData;
        pendingError = actionOutput.pendingActionError;
        loadingNavigation = getLoadingNavigation(location, opts.submission);
        flushSync = false;

        // Create a GET request for the loaders
        request = new Request(request.url, {
          signal: request.signal
        });
      }

      // Call loaders
      let {
        shortCircuited,
        loaderData,
        errors
      } = await handleLoaders(request, location, matches, loadingNavigation, opts && opts.submission, opts && opts.fetcherSubmission, opts && opts.replace, opts && opts.initialHydration === true, flushSync, pendingActionData, pendingError);
      if (shortCircuited) {
        return;
      }

      // Clean up now that the action/loaders have completed.  Don't clean up if
      // we short circuited because pendingNavigationController will have already
      // been assigned to a new controller for the next navigation
      pendingNavigationController = null;
      completeNavigation(location, _extends({
        matches
      }, pendingActionData ? {
        actionData: pendingActionData
      } : {}, {
        loaderData,
        errors
      }));
    }

    // Call the action matched by the leaf route for this navigation and handle
    // redirects/errors
    async function handleAction(request, location, submission, matches, opts) {
      if (opts === void 0) {
        opts = {};
      }
      interruptActiveLoads();

      // Put us in a submitting state
      let navigation = getSubmittingNavigation(location, submission);
      updateState({
        navigation
      }, {
        flushSync: opts.flushSync === true
      });

      // Call our action and get the result
      let result;
      let actionMatch = getTargetMatch(matches, location);
      if (!actionMatch.route.action && !actionMatch.route.lazy) {
        result = {
          type: ResultType.error,
          error: getInternalRouterError(405, {
            method: request.method,
            pathname: location.pathname,
            routeId: actionMatch.route.id
          })
        };
      } else {
        result = await callLoaderOrAction("action", request, actionMatch, matches, manifest, mapRouteProperties, basename, future.v7_relativeSplatPath);
        if (request.signal.aborted) {
          return {
            shortCircuited: true
          };
        }
      }
      if (isRedirectResult(result)) {
        let replace;
        if (opts && opts.replace != null) {
          replace = opts.replace;
        } else {
          // If the user didn't explicity indicate replace behavior, replace if
          // we redirected to the exact same location we're currently at to avoid
          // double back-buttons
          replace = result.location === state.location.pathname + state.location.search;
        }
        await startRedirectNavigation(state, result, {
          submission,
          replace
        });
        return {
          shortCircuited: true
        };
      }
      if (isErrorResult(result)) {
        // Store off the pending error - we use it to determine which loaders
        // to call and will commit it when we complete the navigation
        let boundaryMatch = findNearestBoundary(matches, actionMatch.route.id);

        // By default, all submissions are REPLACE navigations, but if the
        // action threw an error that'll be rendered in an errorElement, we fall
        // back to PUSH so that the user can use the back button to get back to
        // the pre-submission form location to try again
        if ((opts && opts.replace) !== true) {
          pendingAction = Action.Push;
        }
        return {
          // Send back an empty object we can use to clear out any prior actionData
          pendingActionData: {},
          pendingActionError: {
            [boundaryMatch.route.id]: result.error
          }
        };
      }
      if (isDeferredResult(result)) {
        throw getInternalRouterError(400, {
          type: "defer-action"
        });
      }
      return {
        pendingActionData: {
          [actionMatch.route.id]: result.data
        }
      };
    }

    // Call all applicable loaders for the given matches, handling redirects,
    // errors, etc.
    async function handleLoaders(request, location, matches, overrideNavigation, submission, fetcherSubmission, replace, initialHydration, flushSync, pendingActionData, pendingError) {
      // Figure out the right navigation we want to use for data loading
      let loadingNavigation = overrideNavigation || getLoadingNavigation(location, submission);

      // If this was a redirect from an action we don't have a "submission" but
      // we have it on the loading navigation so use that if available
      let activeSubmission = submission || fetcherSubmission || getSubmissionFromNavigation(loadingNavigation);
      let routesToUse = inFlightDataRoutes || dataRoutes;
      let [matchesToLoad, revalidatingFetchers] = getMatchesToLoad(init.history, state, matches, activeSubmission, location, future.v7_partialHydration && initialHydration === true, isRevalidationRequired, cancelledDeferredRoutes, cancelledFetcherLoads, deletedFetchers, fetchLoadMatches, fetchRedirectIds, routesToUse, basename, pendingActionData, pendingError);

      // Cancel pending deferreds for no-longer-matched routes or routes we're
      // about to reload.  Note that if this is an action reload we would have
      // already cancelled all pending deferreds so this would be a no-op
      cancelActiveDeferreds(routeId => !(matches && matches.some(m => m.route.id === routeId)) || matchesToLoad && matchesToLoad.some(m => m.route.id === routeId));
      pendingNavigationLoadId = ++incrementingLoadId;

      // Short circuit if we have no loaders to run
      if (matchesToLoad.length === 0 && revalidatingFetchers.length === 0) {
        let updatedFetchers = markFetchRedirectsDone();
        completeNavigation(location, _extends({
          matches,
          loaderData: {},
          // Commit pending error if we're short circuiting
          errors: pendingError || null
        }, pendingActionData ? {
          actionData: pendingActionData
        } : {}, updatedFetchers ? {
          fetchers: new Map(state.fetchers)
        } : {}), {
          flushSync
        });
        return {
          shortCircuited: true
        };
      }

      // If this is an uninterrupted revalidation, we remain in our current idle
      // state.  If not, we need to switch to our loading state and load data,
      // preserving any new action data or existing action data (in the case of
      // a revalidation interrupting an actionReload)
      // If we have partialHydration enabled, then don't update the state for the
      // initial data load since iot's not a "navigation"
      if (!isUninterruptedRevalidation && (!future.v7_partialHydration || !initialHydration)) {
        revalidatingFetchers.forEach(rf => {
          let fetcher = state.fetchers.get(rf.key);
          let revalidatingFetcher = getLoadingFetcher(undefined, fetcher ? fetcher.data : undefined);
          state.fetchers.set(rf.key, revalidatingFetcher);
        });
        let actionData = pendingActionData || state.actionData;
        updateState(_extends({
          navigation: loadingNavigation
        }, actionData ? Object.keys(actionData).length === 0 ? {
          actionData: null
        } : {
          actionData
        } : {}, revalidatingFetchers.length > 0 ? {
          fetchers: new Map(state.fetchers)
        } : {}), {
          flushSync
        });
      }
      revalidatingFetchers.forEach(rf => {
        if (fetchControllers.has(rf.key)) {
          abortFetcher(rf.key);
        }
        if (rf.controller) {
          // Fetchers use an independent AbortController so that aborting a fetcher
          // (via deleteFetcher) does not abort the triggering navigation that
          // triggered the revalidation
          fetchControllers.set(rf.key, rf.controller);
        }
      });

      // Proxy navigation abort through to revalidation fetchers
      let abortPendingFetchRevalidations = () => revalidatingFetchers.forEach(f => abortFetcher(f.key));
      if (pendingNavigationController) {
        pendingNavigationController.signal.addEventListener("abort", abortPendingFetchRevalidations);
      }
      let {
        results,
        loaderResults,
        fetcherResults
      } = await callLoadersAndMaybeResolveData(state.matches, matches, matchesToLoad, revalidatingFetchers, request);
      if (request.signal.aborted) {
        return {
          shortCircuited: true
        };
      }

      // Clean up _after_ loaders have completed.  Don't clean up if we short
      // circuited because fetchControllers would have been aborted and
      // reassigned to new controllers for the next navigation
      if (pendingNavigationController) {
        pendingNavigationController.signal.removeEventListener("abort", abortPendingFetchRevalidations);
      }
      revalidatingFetchers.forEach(rf => fetchControllers.delete(rf.key));

      // If any loaders returned a redirect Response, start a new REPLACE navigation
      let redirect = findRedirect(results);
      if (redirect) {
        if (redirect.idx >= matchesToLoad.length) {
          // If this redirect came from a fetcher make sure we mark it in
          // fetchRedirectIds so it doesn't get revalidated on the next set of
          // loader executions
          let fetcherKey = revalidatingFetchers[redirect.idx - matchesToLoad.length].key;
          fetchRedirectIds.add(fetcherKey);
        }
        await startRedirectNavigation(state, redirect.result, {
          replace
        });
        return {
          shortCircuited: true
        };
      }

      // Process and commit output from loaders
      let {
        loaderData,
        errors
      } = processLoaderData(state, matches, matchesToLoad, loaderResults, pendingError, revalidatingFetchers, fetcherResults, activeDeferreds);

      // Wire up subscribers to update loaderData as promises settle
      activeDeferreds.forEach((deferredData, routeId) => {
        deferredData.subscribe(aborted => {
          // Note: No need to updateState here since the TrackedPromise on
          // loaderData is stable across resolve/reject
          // Remove this instance if we were aborted or if promises have settled
          if (aborted || deferredData.done) {
            activeDeferreds.delete(routeId);
          }
        });
      });
      let updatedFetchers = markFetchRedirectsDone();
      let didAbortFetchLoads = abortStaleFetchLoads(pendingNavigationLoadId);
      let shouldUpdateFetchers = updatedFetchers || didAbortFetchLoads || revalidatingFetchers.length > 0;
      return _extends({
        loaderData,
        errors
      }, shouldUpdateFetchers ? {
        fetchers: new Map(state.fetchers)
      } : {});
    }

    // Trigger a fetcher load/submit for the given fetcher key
    function fetch(key, routeId, href, opts) {
      if (isServer) {
        throw new Error("router.fetch() was called during the server render, but it shouldn't be. " + "You are likely calling a useFetcher() method in the body of your component. " + "Try moving it to a useEffect or a callback.");
      }
      if (fetchControllers.has(key)) abortFetcher(key);
      let flushSync = (opts && opts.unstable_flushSync) === true;
      let routesToUse = inFlightDataRoutes || dataRoutes;
      let normalizedPath = normalizeTo(state.location, state.matches, basename, future.v7_prependBasename, href, future.v7_relativeSplatPath, routeId, opts == null ? void 0 : opts.relative);
      let matches = matchRoutes(routesToUse, normalizedPath, basename);
      if (!matches) {
        setFetcherError(key, routeId, getInternalRouterError(404, {
          pathname: normalizedPath
        }), {
          flushSync
        });
        return;
      }
      let {
        path,
        submission,
        error
      } = normalizeNavigateOptions(future.v7_normalizeFormMethod, true, normalizedPath, opts);
      if (error) {
        setFetcherError(key, routeId, error, {
          flushSync
        });
        return;
      }
      let match = getTargetMatch(matches, path);
      pendingPreventScrollReset = (opts && opts.preventScrollReset) === true;
      if (submission && isMutationMethod(submission.formMethod)) {
        handleFetcherAction(key, routeId, path, match, matches, flushSync, submission);
        return;
      }

      // Store off the match so we can call it's shouldRevalidate on subsequent
      // revalidations
      fetchLoadMatches.set(key, {
        routeId,
        path
      });
      handleFetcherLoader(key, routeId, path, match, matches, flushSync, submission);
    }

    // Call the action for the matched fetcher.submit(), and then handle redirects,
    // errors, and revalidation
    async function handleFetcherAction(key, routeId, path, match, requestMatches, flushSync, submission) {
      interruptActiveLoads();
      fetchLoadMatches.delete(key);
      if (!match.route.action && !match.route.lazy) {
        let error = getInternalRouterError(405, {
          method: submission.formMethod,
          pathname: path,
          routeId: routeId
        });
        setFetcherError(key, routeId, error, {
          flushSync
        });
        return;
      }

      // Put this fetcher into it's submitting state
      let existingFetcher = state.fetchers.get(key);
      updateFetcherState(key, getSubmittingFetcher(submission, existingFetcher), {
        flushSync
      });

      // Call the action for the fetcher
      let abortController = new AbortController();
      let fetchRequest = createClientSideRequest(init.history, path, abortController.signal, submission);
      fetchControllers.set(key, abortController);
      let originatingLoadId = incrementingLoadId;
      let actionResult = await callLoaderOrAction("action", fetchRequest, match, requestMatches, manifest, mapRouteProperties, basename, future.v7_relativeSplatPath);
      if (fetchRequest.signal.aborted) {
        // We can delete this so long as we weren't aborted by our own fetcher
        // re-submit which would have put _new_ controller is in fetchControllers
        if (fetchControllers.get(key) === abortController) {
          fetchControllers.delete(key);
        }
        return;
      }

      // When using v7_fetcherPersist, we don't want errors bubbling up to the UI
      // or redirects processed for unmounted fetchers so we just revert them to
      // idle
      if (future.v7_fetcherPersist && deletedFetchers.has(key)) {
        if (isRedirectResult(actionResult) || isErrorResult(actionResult)) {
          updateFetcherState(key, getDoneFetcher(undefined));
          return;
        }
        // Let SuccessResult's fall through for revalidation
      } else {
        if (isRedirectResult(actionResult)) {
          fetchControllers.delete(key);
          if (pendingNavigationLoadId > originatingLoadId) {
            // A new navigation was kicked off after our action started, so that
            // should take precedence over this redirect navigation.  We already
            // set isRevalidationRequired so all loaders for the new route should
            // fire unless opted out via shouldRevalidate
            updateFetcherState(key, getDoneFetcher(undefined));
            return;
          } else {
            fetchRedirectIds.add(key);
            updateFetcherState(key, getLoadingFetcher(submission));
            return startRedirectNavigation(state, actionResult, {
              fetcherSubmission: submission
            });
          }
        }

        // Process any non-redirect errors thrown
        if (isErrorResult(actionResult)) {
          setFetcherError(key, routeId, actionResult.error);
          return;
        }
      }
      if (isDeferredResult(actionResult)) {
        throw getInternalRouterError(400, {
          type: "defer-action"
        });
      }

      // Start the data load for current matches, or the next location if we're
      // in the middle of a navigation
      let nextLocation = state.navigation.location || state.location;
      let revalidationRequest = createClientSideRequest(init.history, nextLocation, abortController.signal);
      let routesToUse = inFlightDataRoutes || dataRoutes;
      let matches = state.navigation.state !== "idle" ? matchRoutes(routesToUse, state.navigation.location, basename) : state.matches;
      invariant(matches, "Didn't find any matches after fetcher action");
      let loadId = ++incrementingLoadId;
      fetchReloadIds.set(key, loadId);
      let loadFetcher = getLoadingFetcher(submission, actionResult.data);
      state.fetchers.set(key, loadFetcher);
      let [matchesToLoad, revalidatingFetchers] = getMatchesToLoad(init.history, state, matches, submission, nextLocation, false, isRevalidationRequired, cancelledDeferredRoutes, cancelledFetcherLoads, deletedFetchers, fetchLoadMatches, fetchRedirectIds, routesToUse, basename, {
        [match.route.id]: actionResult.data
      }, undefined // No need to send through errors since we short circuit above
      );

      // Put all revalidating fetchers into the loading state, except for the
      // current fetcher which we want to keep in it's current loading state which
      // contains it's action submission info + action data
      revalidatingFetchers.filter(rf => rf.key !== key).forEach(rf => {
        let staleKey = rf.key;
        let existingFetcher = state.fetchers.get(staleKey);
        let revalidatingFetcher = getLoadingFetcher(undefined, existingFetcher ? existingFetcher.data : undefined);
        state.fetchers.set(staleKey, revalidatingFetcher);
        if (fetchControllers.has(staleKey)) {
          abortFetcher(staleKey);
        }
        if (rf.controller) {
          fetchControllers.set(staleKey, rf.controller);
        }
      });
      updateState({
        fetchers: new Map(state.fetchers)
      });
      let abortPendingFetchRevalidations = () => revalidatingFetchers.forEach(rf => abortFetcher(rf.key));
      abortController.signal.addEventListener("abort", abortPendingFetchRevalidations);
      let {
        results,
        loaderResults,
        fetcherResults
      } = await callLoadersAndMaybeResolveData(state.matches, matches, matchesToLoad, revalidatingFetchers, revalidationRequest);
      if (abortController.signal.aborted) {
        return;
      }
      abortController.signal.removeEventListener("abort", abortPendingFetchRevalidations);
      fetchReloadIds.delete(key);
      fetchControllers.delete(key);
      revalidatingFetchers.forEach(r => fetchControllers.delete(r.key));
      let redirect = findRedirect(results);
      if (redirect) {
        if (redirect.idx >= matchesToLoad.length) {
          // If this redirect came from a fetcher make sure we mark it in
          // fetchRedirectIds so it doesn't get revalidated on the next set of
          // loader executions
          let fetcherKey = revalidatingFetchers[redirect.idx - matchesToLoad.length].key;
          fetchRedirectIds.add(fetcherKey);
        }
        return startRedirectNavigation(state, redirect.result);
      }

      // Process and commit output from loaders
      let {
        loaderData,
        errors
      } = processLoaderData(state, state.matches, matchesToLoad, loaderResults, undefined, revalidatingFetchers, fetcherResults, activeDeferreds);

      // Since we let revalidations complete even if the submitting fetcher was
      // deleted, only put it back to idle if it hasn't been deleted
      if (state.fetchers.has(key)) {
        let doneFetcher = getDoneFetcher(actionResult.data);
        state.fetchers.set(key, doneFetcher);
      }
      abortStaleFetchLoads(loadId);

      // If we are currently in a navigation loading state and this fetcher is
      // more recent than the navigation, we want the newer data so abort the
      // navigation and complete it with the fetcher data
      if (state.navigation.state === "loading" && loadId > pendingNavigationLoadId) {
        invariant(pendingAction, "Expected pending action");
        pendingNavigationController && pendingNavigationController.abort();
        completeNavigation(state.navigation.location, {
          matches,
          loaderData,
          errors,
          fetchers: new Map(state.fetchers)
        });
      } else {
        // otherwise just update with the fetcher data, preserving any existing
        // loaderData for loaders that did not need to reload.  We have to
        // manually merge here since we aren't going through completeNavigation
        updateState({
          errors,
          loaderData: mergeLoaderData(state.loaderData, loaderData, matches, errors),
          fetchers: new Map(state.fetchers)
        });
        isRevalidationRequired = false;
      }
    }

    // Call the matched loader for fetcher.load(), handling redirects, errors, etc.
    async function handleFetcherLoader(key, routeId, path, match, matches, flushSync, submission) {
      let existingFetcher = state.fetchers.get(key);
      updateFetcherState(key, getLoadingFetcher(submission, existingFetcher ? existingFetcher.data : undefined), {
        flushSync
      });

      // Call the loader for this fetcher route match
      let abortController = new AbortController();
      let fetchRequest = createClientSideRequest(init.history, path, abortController.signal);
      fetchControllers.set(key, abortController);
      let originatingLoadId = incrementingLoadId;
      let result = await callLoaderOrAction("loader", fetchRequest, match, matches, manifest, mapRouteProperties, basename, future.v7_relativeSplatPath);

      // Deferred isn't supported for fetcher loads, await everything and treat it
      // as a normal load.  resolveDeferredData will return undefined if this
      // fetcher gets aborted, so we just leave result untouched and short circuit
      // below if that happens
      if (isDeferredResult(result)) {
        result = (await resolveDeferredData(result, fetchRequest.signal, true)) || result;
      }

      // We can delete this so long as we weren't aborted by our our own fetcher
      // re-load which would have put _new_ controller is in fetchControllers
      if (fetchControllers.get(key) === abortController) {
        fetchControllers.delete(key);
      }
      if (fetchRequest.signal.aborted) {
        return;
      }

      // We don't want errors bubbling up or redirects followed for unmounted
      // fetchers, so short circuit here if it was removed from the UI
      if (deletedFetchers.has(key)) {
        updateFetcherState(key, getDoneFetcher(undefined));
        return;
      }

      // If the loader threw a redirect Response, start a new REPLACE navigation
      if (isRedirectResult(result)) {
        if (pendingNavigationLoadId > originatingLoadId) {
          // A new navigation was kicked off after our loader started, so that
          // should take precedence over this redirect navigation
          updateFetcherState(key, getDoneFetcher(undefined));
          return;
        } else {
          fetchRedirectIds.add(key);
          await startRedirectNavigation(state, result);
          return;
        }
      }

      // Process any non-redirect errors thrown
      if (isErrorResult(result)) {
        setFetcherError(key, routeId, result.error);
        return;
      }
      invariant(!isDeferredResult(result), "Unhandled fetcher deferred data");

      // Put the fetcher back into an idle state
      updateFetcherState(key, getDoneFetcher(result.data));
    }

    /**
     * Utility function to handle redirects returned from an action or loader.
     * Normally, a redirect "replaces" the navigation that triggered it.  So, for
     * example:
     *
     *  - user is on /a
     *  - user clicks a link to /b
     *  - loader for /b redirects to /c
     *
     * In a non-JS app the browser would track the in-flight navigation to /b and
     * then replace it with /c when it encountered the redirect response.  In
     * the end it would only ever update the URL bar with /c.
     *
     * In client-side routing using pushState/replaceState, we aim to emulate
     * this behavior and we also do not update history until the end of the
     * navigation (including processed redirects).  This means that we never
     * actually touch history until we've processed redirects, so we just use
     * the history action from the original navigation (PUSH or REPLACE).
     */
    async function startRedirectNavigation(state, redirect, _temp2) {
      let {
        submission,
        fetcherSubmission,
        replace
      } = _temp2 === void 0 ? {} : _temp2;
      if (redirect.revalidate) {
        isRevalidationRequired = true;
      }
      let redirectLocation = createLocation(state.location, redirect.location, {
        _isRedirect: true
      });
      invariant(redirectLocation, "Expected a location on the redirect navigation");
      if (isBrowser) {
        let isDocumentReload = false;
        if (redirect.reloadDocument) {
          // Hard reload if the response contained X-Remix-Reload-Document
          isDocumentReload = true;
        } else if (ABSOLUTE_URL_REGEX.test(redirect.location)) {
          const url = init.history.createURL(redirect.location);
          isDocumentReload =
          // Hard reload if it's an absolute URL to a new origin
          url.origin !== routerWindow.location.origin ||
          // Hard reload if it's an absolute URL that does not match our basename
          stripBasename(url.pathname, basename) == null;
        }
        if (isDocumentReload) {
          if (replace) {
            routerWindow.location.replace(redirect.location);
          } else {
            routerWindow.location.assign(redirect.location);
          }
          return;
        }
      }

      // There's no need to abort on redirects, since we don't detect the
      // redirect until the action/loaders have settled
      pendingNavigationController = null;
      let redirectHistoryAction = replace === true ? Action.Replace : Action.Push;

      // Use the incoming submission if provided, fallback on the active one in
      // state.navigation
      let {
        formMethod,
        formAction,
        formEncType
      } = state.navigation;
      if (!submission && !fetcherSubmission && formMethod && formAction && formEncType) {
        submission = getSubmissionFromNavigation(state.navigation);
      }

      // If this was a 307/308 submission we want to preserve the HTTP method and
      // re-submit the GET/POST/PUT/PATCH/DELETE as a submission navigation to the
      // redirected location
      let activeSubmission = submission || fetcherSubmission;
      if (redirectPreserveMethodStatusCodes.has(redirect.status) && activeSubmission && isMutationMethod(activeSubmission.formMethod)) {
        await startNavigation(redirectHistoryAction, redirectLocation, {
          submission: _extends({}, activeSubmission, {
            formAction: redirect.location
          }),
          // Preserve this flag across redirects
          preventScrollReset: pendingPreventScrollReset
        });
      } else {
        // If we have a navigation submission, we will preserve it through the
        // redirect navigation
        let overrideNavigation = getLoadingNavigation(redirectLocation, submission);
        await startNavigation(redirectHistoryAction, redirectLocation, {
          overrideNavigation,
          // Send fetcher submissions through for shouldRevalidate
          fetcherSubmission,
          // Preserve this flag across redirects
          preventScrollReset: pendingPreventScrollReset
        });
      }
    }
    async function callLoadersAndMaybeResolveData(currentMatches, matches, matchesToLoad, fetchersToLoad, request) {
      // Call all navigation loaders and revalidating fetcher loaders in parallel,
      // then slice off the results into separate arrays so we can handle them
      // accordingly
      let results = await Promise.all([...matchesToLoad.map(match => callLoaderOrAction("loader", request, match, matches, manifest, mapRouteProperties, basename, future.v7_relativeSplatPath)), ...fetchersToLoad.map(f => {
        if (f.matches && f.match && f.controller) {
          return callLoaderOrAction("loader", createClientSideRequest(init.history, f.path, f.controller.signal), f.match, f.matches, manifest, mapRouteProperties, basename, future.v7_relativeSplatPath);
        } else {
          let error = {
            type: ResultType.error,
            error: getInternalRouterError(404, {
              pathname: f.path
            })
          };
          return error;
        }
      })]);
      let loaderResults = results.slice(0, matchesToLoad.length);
      let fetcherResults = results.slice(matchesToLoad.length);
      await Promise.all([resolveDeferredResults(currentMatches, matchesToLoad, loaderResults, loaderResults.map(() => request.signal), false, state.loaderData), resolveDeferredResults(currentMatches, fetchersToLoad.map(f => f.match), fetcherResults, fetchersToLoad.map(f => f.controller ? f.controller.signal : null), true)]);
      return {
        results,
        loaderResults,
        fetcherResults
      };
    }
    function interruptActiveLoads() {
      // Every interruption triggers a revalidation
      isRevalidationRequired = true;

      // Cancel pending route-level deferreds and mark cancelled routes for
      // revalidation
      cancelledDeferredRoutes.push(...cancelActiveDeferreds());

      // Abort in-flight fetcher loads
      fetchLoadMatches.forEach((_, key) => {
        if (fetchControllers.has(key)) {
          cancelledFetcherLoads.push(key);
          abortFetcher(key);
        }
      });
    }
    function updateFetcherState(key, fetcher, opts) {
      if (opts === void 0) {
        opts = {};
      }
      state.fetchers.set(key, fetcher);
      updateState({
        fetchers: new Map(state.fetchers)
      }, {
        flushSync: (opts && opts.flushSync) === true
      });
    }
    function setFetcherError(key, routeId, error, opts) {
      if (opts === void 0) {
        opts = {};
      }
      let boundaryMatch = findNearestBoundary(state.matches, routeId);
      deleteFetcher(key);
      updateState({
        errors: {
          [boundaryMatch.route.id]: error
        },
        fetchers: new Map(state.fetchers)
      }, {
        flushSync: (opts && opts.flushSync) === true
      });
    }
    function getFetcher(key) {
      if (future.v7_fetcherPersist) {
        activeFetchers.set(key, (activeFetchers.get(key) || 0) + 1);
        // If this fetcher was previously marked for deletion, unmark it since we
        // have a new instance
        if (deletedFetchers.has(key)) {
          deletedFetchers.delete(key);
        }
      }
      return state.fetchers.get(key) || IDLE_FETCHER;
    }
    function deleteFetcher(key) {
      let fetcher = state.fetchers.get(key);
      // Don't abort the controller if this is a deletion of a fetcher.submit()
      // in it's loading phase since - we don't want to abort the corresponding
      // revalidation and want them to complete and land
      if (fetchControllers.has(key) && !(fetcher && fetcher.state === "loading" && fetchReloadIds.has(key))) {
        abortFetcher(key);
      }
      fetchLoadMatches.delete(key);
      fetchReloadIds.delete(key);
      fetchRedirectIds.delete(key);
      deletedFetchers.delete(key);
      state.fetchers.delete(key);
    }
    function deleteFetcherAndUpdateState(key) {
      if (future.v7_fetcherPersist) {
        let count = (activeFetchers.get(key) || 0) - 1;
        if (count <= 0) {
          activeFetchers.delete(key);
          deletedFetchers.add(key);
        } else {
          activeFetchers.set(key, count);
        }
      } else {
        deleteFetcher(key);
      }
      updateState({
        fetchers: new Map(state.fetchers)
      });
    }
    function abortFetcher(key) {
      let controller = fetchControllers.get(key);
      invariant(controller, "Expected fetch controller: " + key);
      controller.abort();
      fetchControllers.delete(key);
    }
    function markFetchersDone(keys) {
      for (let key of keys) {
        let fetcher = getFetcher(key);
        let doneFetcher = getDoneFetcher(fetcher.data);
        state.fetchers.set(key, doneFetcher);
      }
    }
    function markFetchRedirectsDone() {
      let doneKeys = [];
      let updatedFetchers = false;
      for (let key of fetchRedirectIds) {
        let fetcher = state.fetchers.get(key);
        invariant(fetcher, "Expected fetcher: " + key);
        if (fetcher.state === "loading") {
          fetchRedirectIds.delete(key);
          doneKeys.push(key);
          updatedFetchers = true;
        }
      }
      markFetchersDone(doneKeys);
      return updatedFetchers;
    }
    function abortStaleFetchLoads(landedId) {
      let yeetedKeys = [];
      for (let [key, id] of fetchReloadIds) {
        if (id < landedId) {
          let fetcher = state.fetchers.get(key);
          invariant(fetcher, "Expected fetcher: " + key);
          if (fetcher.state === "loading") {
            abortFetcher(key);
            fetchReloadIds.delete(key);
            yeetedKeys.push(key);
          }
        }
      }
      markFetchersDone(yeetedKeys);
      return yeetedKeys.length > 0;
    }
    function getBlocker(key, fn) {
      let blocker = state.blockers.get(key) || IDLE_BLOCKER;
      if (blockerFunctions.get(key) !== fn) {
        blockerFunctions.set(key, fn);
      }
      return blocker;
    }
    function deleteBlocker(key) {
      state.blockers.delete(key);
      blockerFunctions.delete(key);
    }

    // Utility function to update blockers, ensuring valid state transitions
    function updateBlocker(key, newBlocker) {
      let blocker = state.blockers.get(key) || IDLE_BLOCKER;

      // Poor mans state machine :)
      // https://mermaid.live/edit#pako:eNqVkc9OwzAMxl8l8nnjAYrEtDIOHEBIgwvKJTReGy3_lDpIqO27k6awMG0XcrLlnz87nwdonESogKXXBuE79rq75XZO3-yHds0RJVuv70YrPlUrCEe2HfrORS3rubqZfuhtpg5C9wk5tZ4VKcRUq88q9Z8RS0-48cE1iHJkL0ugbHuFLus9L6spZy8nX9MP2CNdomVaposqu3fGayT8T8-jJQwhepo_UtpgBQaDEUom04dZhAN1aJBDlUKJBxE1ceB2Smj0Mln-IBW5AFU2dwUiktt_2Qaq2dBfaKdEup85UV7Yd-dKjlnkabl2Pvr0DTkTreM
      invariant(blocker.state === "unblocked" && newBlocker.state === "blocked" || blocker.state === "blocked" && newBlocker.state === "blocked" || blocker.state === "blocked" && newBlocker.state === "proceeding" || blocker.state === "blocked" && newBlocker.state === "unblocked" || blocker.state === "proceeding" && newBlocker.state === "unblocked", "Invalid blocker state transition: " + blocker.state + " -> " + newBlocker.state);
      let blockers = new Map(state.blockers);
      blockers.set(key, newBlocker);
      updateState({
        blockers
      });
    }
    function shouldBlockNavigation(_ref2) {
      let {
        currentLocation,
        nextLocation,
        historyAction
      } = _ref2;
      if (blockerFunctions.size === 0) {
        return;
      }

      // We ony support a single active blocker at the moment since we don't have
      // any compelling use cases for multi-blocker yet
      if (blockerFunctions.size > 1) {
        warning(false, "A router only supports one blocker at a time");
      }
      let entries = Array.from(blockerFunctions.entries());
      let [blockerKey, blockerFunction] = entries[entries.length - 1];
      let blocker = state.blockers.get(blockerKey);
      if (blocker && blocker.state === "proceeding") {
        // If the blocker is currently proceeding, we don't need to re-check
        // it and can let this navigation continue
        return;
      }

      // At this point, we know we're unblocked/blocked so we need to check the
      // user-provided blocker function
      if (blockerFunction({
        currentLocation,
        nextLocation,
        historyAction
      })) {
        return blockerKey;
      }
    }
    function cancelActiveDeferreds(predicate) {
      let cancelledRouteIds = [];
      activeDeferreds.forEach((dfd, routeId) => {
        if (!predicate || predicate(routeId)) {
          // Cancel the deferred - but do not remove from activeDeferreds here -
          // we rely on the subscribers to do that so our tests can assert proper
          // cleanup via _internalActiveDeferreds
          dfd.cancel();
          cancelledRouteIds.push(routeId);
          activeDeferreds.delete(routeId);
        }
      });
      return cancelledRouteIds;
    }

    // Opt in to capturing and reporting scroll positions during navigations,
    // used by the <ScrollRestoration> component
    function enableScrollRestoration(positions, getPosition, getKey) {
      savedScrollPositions = positions;
      getScrollPosition = getPosition;
      getScrollRestorationKey = getKey || null;

      // Perform initial hydration scroll restoration, since we miss the boat on
      // the initial updateState() because we've not yet rendered <ScrollRestoration/>
      // and therefore have no savedScrollPositions available
      if (!initialScrollRestored && state.navigation === IDLE_NAVIGATION) {
        initialScrollRestored = true;
        let y = getSavedScrollPosition(state.location, state.matches);
        if (y != null) {
          updateState({
            restoreScrollPosition: y
          });
        }
      }
      return () => {
        savedScrollPositions = null;
        getScrollPosition = null;
        getScrollRestorationKey = null;
      };
    }
    function getScrollKey(location, matches) {
      if (getScrollRestorationKey) {
        let key = getScrollRestorationKey(location, matches.map(m => convertRouteMatchToUiMatch(m, state.loaderData)));
        return key || location.key;
      }
      return location.key;
    }
    function saveScrollPosition(location, matches) {
      if (savedScrollPositions && getScrollPosition) {
        let key = getScrollKey(location, matches);
        savedScrollPositions[key] = getScrollPosition();
      }
    }
    function getSavedScrollPosition(location, matches) {
      if (savedScrollPositions) {
        let key = getScrollKey(location, matches);
        let y = savedScrollPositions[key];
        if (typeof y === "number") {
          return y;
        }
      }
      return null;
    }
    function _internalSetRoutes(newRoutes) {
      manifest = {};
      inFlightDataRoutes = convertRoutesToDataRoutes(newRoutes, mapRouteProperties, undefined, manifest);
    }
    router = {
      get basename() {
        return basename;
      },
      get future() {
        return future;
      },
      get state() {
        return state;
      },
      get routes() {
        return dataRoutes;
      },
      get window() {
        return routerWindow;
      },
      initialize,
      subscribe,
      enableScrollRestoration,
      navigate,
      fetch,
      revalidate,
      // Passthrough to history-aware createHref used by useHref so we get proper
      // hash-aware URLs in DOM paths
      createHref: to => init.history.createHref(to),
      encodeLocation: to => init.history.encodeLocation(to),
      getFetcher,
      deleteFetcher: deleteFetcherAndUpdateState,
      dispose,
      getBlocker,
      deleteBlocker,
      _internalFetchControllers: fetchControllers,
      _internalActiveDeferreds: activeDeferreds,
      // TODO: Remove setRoutes, it's temporary to avoid dealing with
      // updating the tree while validating the update algorithm.
      _internalSetRoutes
    };
    return router;
  }
  //#endregion

  ////////////////////////////////////////////////////////////////////////////////
  //#region createStaticHandler
  ////////////////////////////////////////////////////////////////////////////////

  const UNSAFE_DEFERRED_SYMBOL = Symbol("deferred");

  /**
   * Future flags to toggle new feature behavior
   */

  function createStaticHandler(routes, opts) {
    invariant(routes.length > 0, "You must provide a non-empty routes array to createStaticHandler");
    let manifest = {};
    let basename = (opts ? opts.basename : null) || "/";
    let mapRouteProperties;
    if (opts != null && opts.mapRouteProperties) {
      mapRouteProperties = opts.mapRouteProperties;
    } else if (opts != null && opts.detectErrorBoundary) {
      // If they are still using the deprecated version, wrap it with the new API
      let detectErrorBoundary = opts.detectErrorBoundary;
      mapRouteProperties = route => ({
        hasErrorBoundary: detectErrorBoundary(route)
      });
    } else {
      mapRouteProperties = defaultMapRouteProperties;
    }
    // Config driven behavior flags
    let future = _extends({
      v7_relativeSplatPath: false,
      v7_throwAbortReason: false
    }, opts ? opts.future : null);
    let dataRoutes = convertRoutesToDataRoutes(routes, mapRouteProperties, undefined, manifest);

    /**
     * The query() method is intended for document requests, in which we want to
     * call an optional action and potentially multiple loaders for all nested
     * routes.  It returns a StaticHandlerContext object, which is very similar
     * to the router state (location, loaderData, actionData, errors, etc.) and
     * also adds SSR-specific information such as the statusCode and headers
     * from action/loaders Responses.
     *
     * It _should_ never throw and should report all errors through the
     * returned context.errors object, properly associating errors to their error
     * boundary.  Additionally, it tracks _deepestRenderedBoundaryId which can be
     * used to emulate React error boundaries during SSr by performing a second
     * pass only down to the boundaryId.
     *
     * The one exception where we do not return a StaticHandlerContext is when a
     * redirect response is returned or thrown from any action/loader.  We
     * propagate that out and return the raw Response so the HTTP server can
     * return it directly.
     */
    async function query(request, _temp3) {
      let {
        requestContext
      } = _temp3 === void 0 ? {} : _temp3;
      let url = new URL(request.url);
      let method = request.method;
      let location = createLocation("", createPath(url), null, "default");
      let matches = matchRoutes(dataRoutes, location, basename);

      // SSR supports HEAD requests while SPA doesn't
      if (!isValidMethod(method) && method !== "HEAD") {
        let error = getInternalRouterError(405, {
          method
        });
        let {
          matches: methodNotAllowedMatches,
          route
        } = getShortCircuitMatches(dataRoutes);
        return {
          basename,
          location,
          matches: methodNotAllowedMatches,
          loaderData: {},
          actionData: null,
          errors: {
            [route.id]: error
          },
          statusCode: error.status,
          loaderHeaders: {},
          actionHeaders: {},
          activeDeferreds: null
        };
      } else if (!matches) {
        let error = getInternalRouterError(404, {
          pathname: location.pathname
        });
        let {
          matches: notFoundMatches,
          route
        } = getShortCircuitMatches(dataRoutes);
        return {
          basename,
          location,
          matches: notFoundMatches,
          loaderData: {},
          actionData: null,
          errors: {
            [route.id]: error
          },
          statusCode: error.status,
          loaderHeaders: {},
          actionHeaders: {},
          activeDeferreds: null
        };
      }
      let result = await queryImpl(request, location, matches, requestContext);
      if (isResponse(result)) {
        return result;
      }

      // When returning StaticHandlerContext, we patch back in the location here
      // since we need it for React Context.  But this helps keep our submit and
      // loadRouteData operating on a Request instead of a Location
      return _extends({
        location,
        basename
      }, result);
    }

    /**
     * The queryRoute() method is intended for targeted route requests, either
     * for fetch ?_data requests or resource route requests.  In this case, we
     * are only ever calling a single action or loader, and we are returning the
     * returned value directly.  In most cases, this will be a Response returned
     * from the action/loader, but it may be a primitive or other value as well -
     * and in such cases the calling context should handle that accordingly.
     *
     * We do respect the throw/return differentiation, so if an action/loader
     * throws, then this method will throw the value.  This is important so we
     * can do proper boundary identification in Remix where a thrown Response
     * must go to the Catch Boundary but a returned Response is happy-path.
     *
     * One thing to note is that any Router-initiated Errors that make sense
     * to associate with a status code will be thrown as an ErrorResponse
     * instance which include the raw Error, such that the calling context can
     * serialize the error as they see fit while including the proper response
     * code.  Examples here are 404 and 405 errors that occur prior to reaching
     * any user-defined loaders.
     */
    async function queryRoute(request, _temp4) {
      let {
        routeId,
        requestContext
      } = _temp4 === void 0 ? {} : _temp4;
      let url = new URL(request.url);
      let method = request.method;
      let location = createLocation("", createPath(url), null, "default");
      let matches = matchRoutes(dataRoutes, location, basename);

      // SSR supports HEAD requests while SPA doesn't
      if (!isValidMethod(method) && method !== "HEAD" && method !== "OPTIONS") {
        throw getInternalRouterError(405, {
          method
        });
      } else if (!matches) {
        throw getInternalRouterError(404, {
          pathname: location.pathname
        });
      }
      let match = routeId ? matches.find(m => m.route.id === routeId) : getTargetMatch(matches, location);
      if (routeId && !match) {
        throw getInternalRouterError(403, {
          pathname: location.pathname,
          routeId
        });
      } else if (!match) {
        // This should never hit I don't think?
        throw getInternalRouterError(404, {
          pathname: location.pathname
        });
      }
      let result = await queryImpl(request, location, matches, requestContext, match);
      if (isResponse(result)) {
        return result;
      }
      let error = result.errors ? Object.values(result.errors)[0] : undefined;
      if (error !== undefined) {
        // If we got back result.errors, that means the loader/action threw
        // _something_ that wasn't a Response, but it's not guaranteed/required
        // to be an `instanceof Error` either, so we have to use throw here to
        // preserve the "error" state outside of queryImpl.
        throw error;
      }

      // Pick off the right state value to return
      if (result.actionData) {
        return Object.values(result.actionData)[0];
      }
      if (result.loaderData) {
        var _result$activeDeferre;
        let data = Object.values(result.loaderData)[0];
        if ((_result$activeDeferre = result.activeDeferreds) != null && _result$activeDeferre[match.route.id]) {
          data[UNSAFE_DEFERRED_SYMBOL] = result.activeDeferreds[match.route.id];
        }
        return data;
      }
      return undefined;
    }
    async function queryImpl(request, location, matches, requestContext, routeMatch) {
      invariant(request.signal, "query()/queryRoute() requests must contain an AbortController signal");
      try {
        if (isMutationMethod(request.method.toLowerCase())) {
          let result = await submit(request, matches, routeMatch || getTargetMatch(matches, location), requestContext, routeMatch != null);
          return result;
        }
        let result = await loadRouteData(request, matches, requestContext, routeMatch);
        return isResponse(result) ? result : _extends({}, result, {
          actionData: null,
          actionHeaders: {}
        });
      } catch (e) {
        // If the user threw/returned a Response in callLoaderOrAction, we throw
        // it to bail out and then return or throw here based on whether the user
        // returned or threw
        if (isQueryRouteResponse(e)) {
          if (e.type === ResultType.error) {
            throw e.response;
          }
          return e.response;
        }
        // Redirects are always returned since they don't propagate to catch
        // boundaries
        if (isRedirectResponse(e)) {
          return e;
        }
        throw e;
      }
    }
    async function submit(request, matches, actionMatch, requestContext, isRouteRequest) {
      let result;
      if (!actionMatch.route.action && !actionMatch.route.lazy) {
        let error = getInternalRouterError(405, {
          method: request.method,
          pathname: new URL(request.url).pathname,
          routeId: actionMatch.route.id
        });
        if (isRouteRequest) {
          throw error;
        }
        result = {
          type: ResultType.error,
          error
        };
      } else {
        result = await callLoaderOrAction("action", request, actionMatch, matches, manifest, mapRouteProperties, basename, future.v7_relativeSplatPath, {
          isStaticRequest: true,
          isRouteRequest,
          requestContext
        });
        if (request.signal.aborted) {
          throwStaticHandlerAbortedError(request, isRouteRequest, future);
        }
      }
      if (isRedirectResult(result)) {
        // Uhhhh - this should never happen, we should always throw these from
        // callLoaderOrAction, but the type narrowing here keeps TS happy and we
        // can get back on the "throw all redirect responses" train here should
        // this ever happen :/
        throw new Response(null, {
          status: result.status,
          headers: {
            Location: result.location
          }
        });
      }
      if (isDeferredResult(result)) {
        let error = getInternalRouterError(400, {
          type: "defer-action"
        });
        if (isRouteRequest) {
          throw error;
        }
        result = {
          type: ResultType.error,
          error
        };
      }
      if (isRouteRequest) {
        // Note: This should only be non-Response values if we get here, since
        // isRouteRequest should throw any Response received in callLoaderOrAction
        if (isErrorResult(result)) {
          throw result.error;
        }
        return {
          matches: [actionMatch],
          loaderData: {},
          actionData: {
            [actionMatch.route.id]: result.data
          },
          errors: null,
          // Note: statusCode + headers are unused here since queryRoute will
          // return the raw Response or value
          statusCode: 200,
          loaderHeaders: {},
          actionHeaders: {},
          activeDeferreds: null
        };
      }
      if (isErrorResult(result)) {
        // Store off the pending error - we use it to determine which loaders
        // to call and will commit it when we complete the navigation
        let boundaryMatch = findNearestBoundary(matches, actionMatch.route.id);
        let context = await loadRouteData(request, matches, requestContext, undefined, {
          [boundaryMatch.route.id]: result.error
        });

        // action status codes take precedence over loader status codes
        return _extends({}, context, {
          statusCode: isRouteErrorResponse(result.error) ? result.error.status : 500,
          actionData: null,
          actionHeaders: _extends({}, result.headers ? {
            [actionMatch.route.id]: result.headers
          } : {})
        });
      }

      // Create a GET request for the loaders
      let loaderRequest = new Request(request.url, {
        headers: request.headers,
        redirect: request.redirect,
        signal: request.signal
      });
      let context = await loadRouteData(loaderRequest, matches, requestContext);
      return _extends({}, context, result.statusCode ? {
        statusCode: result.statusCode
      } : {}, {
        actionData: {
          [actionMatch.route.id]: result.data
        },
        actionHeaders: _extends({}, result.headers ? {
          [actionMatch.route.id]: result.headers
        } : {})
      });
    }
    async function loadRouteData(request, matches, requestContext, routeMatch, pendingActionError) {
      let isRouteRequest = routeMatch != null;

      // Short circuit if we have no loaders to run (queryRoute())
      if (isRouteRequest && !(routeMatch != null && routeMatch.route.loader) && !(routeMatch != null && routeMatch.route.lazy)) {
        throw getInternalRouterError(400, {
          method: request.method,
          pathname: new URL(request.url).pathname,
          routeId: routeMatch == null ? void 0 : routeMatch.route.id
        });
      }
      let requestMatches = routeMatch ? [routeMatch] : getLoaderMatchesUntilBoundary(matches, Object.keys(pendingActionError || {})[0]);
      let matchesToLoad = requestMatches.filter(m => m.route.loader || m.route.lazy);

      // Short circuit if we have no loaders to run (query())
      if (matchesToLoad.length === 0) {
        return {
          matches,
          // Add a null for all matched routes for proper revalidation on the client
          loaderData: matches.reduce((acc, m) => Object.assign(acc, {
            [m.route.id]: null
          }), {}),
          errors: pendingActionError || null,
          statusCode: 200,
          loaderHeaders: {},
          activeDeferreds: null
        };
      }
      let results = await Promise.all([...matchesToLoad.map(match => callLoaderOrAction("loader", request, match, matches, manifest, mapRouteProperties, basename, future.v7_relativeSplatPath, {
        isStaticRequest: true,
        isRouteRequest,
        requestContext
      }))]);
      if (request.signal.aborted) {
        throwStaticHandlerAbortedError(request, isRouteRequest, future);
      }

      // Process and commit output from loaders
      let activeDeferreds = new Map();
      let context = processRouteLoaderData(matches, matchesToLoad, results, pendingActionError, activeDeferreds);

      // Add a null for any non-loader matches for proper revalidation on the client
      let executedLoaders = new Set(matchesToLoad.map(match => match.route.id));
      matches.forEach(match => {
        if (!executedLoaders.has(match.route.id)) {
          context.loaderData[match.route.id] = null;
        }
      });
      return _extends({}, context, {
        matches,
        activeDeferreds: activeDeferreds.size > 0 ? Object.fromEntries(activeDeferreds.entries()) : null
      });
    }
    return {
      dataRoutes,
      query,
      queryRoute
    };
  }

  //#endregion

  ////////////////////////////////////////////////////////////////////////////////
  //#region Helpers
  ////////////////////////////////////////////////////////////////////////////////

  /**
   * Given an existing StaticHandlerContext and an error thrown at render time,
   * provide an updated StaticHandlerContext suitable for a second SSR render
   */
  function getStaticContextFromError(routes, context, error) {
    let newContext = _extends({}, context, {
      statusCode: isRouteErrorResponse(error) ? error.status : 500,
      errors: {
        [context._deepestRenderedBoundaryId || routes[0].id]: error
      }
    });
    return newContext;
  }
  function throwStaticHandlerAbortedError(request, isRouteRequest, future) {
    if (future.v7_throwAbortReason && request.signal.reason !== undefined) {
      throw request.signal.reason;
    }
    let method = isRouteRequest ? "queryRoute" : "query";
    throw new Error(method + "() call aborted: " + request.method + " " + request.url);
  }
  function isSubmissionNavigation(opts) {
    return opts != null && ("formData" in opts && opts.formData != null || "body" in opts && opts.body !== undefined);
  }
  function normalizeTo(location, matches, basename, prependBasename, to, v7_relativeSplatPath, fromRouteId, relative) {
    let contextualMatches;
    let activeRouteMatch;
    if (fromRouteId) {
      // Grab matches up to the calling route so our route-relative logic is
      // relative to the correct source route
      contextualMatches = [];
      for (let match of matches) {
        contextualMatches.push(match);
        if (match.route.id === fromRouteId) {
          activeRouteMatch = match;
          break;
        }
      }
    } else {
      contextualMatches = matches;
      activeRouteMatch = matches[matches.length - 1];
    }

    // Resolve the relative path
    let path = resolveTo(to ? to : ".", getResolveToMatches(contextualMatches, v7_relativeSplatPath), stripBasename(location.pathname, basename) || location.pathname, relative === "path");

    // When `to` is not specified we inherit search/hash from the current
    // location, unlike when to="." and we just inherit the path.
    // See https://github.com/remix-run/remix/issues/927
    if (to == null) {
      path.search = location.search;
      path.hash = location.hash;
    }

    // Add an ?index param for matched index routes if we don't already have one
    if ((to == null || to === "" || to === ".") && activeRouteMatch && activeRouteMatch.route.index && !hasNakedIndexQuery(path.search)) {
      path.search = path.search ? path.search.replace(/^\?/, "?index&") : "?index";
    }

    // If we're operating within a basename, prepend it to the pathname.  If
    // this is a root navigation, then just use the raw basename which allows
    // the basename to have full control over the presence of a trailing slash
    // on root actions
    if (prependBasename && basename !== "/") {
      path.pathname = path.pathname === "/" ? basename : joinPaths([basename, path.pathname]);
    }
    return createPath(path);
  }

  // Normalize navigation options by converting formMethod=GET formData objects to
  // URLSearchParams so they behave identically to links with query params
  function normalizeNavigateOptions(normalizeFormMethod, isFetcher, path, opts) {
    // Return location verbatim on non-submission navigations
    if (!opts || !isSubmissionNavigation(opts)) {
      return {
        path
      };
    }
    if (opts.formMethod && !isValidMethod(opts.formMethod)) {
      return {
        path,
        error: getInternalRouterError(405, {
          method: opts.formMethod
        })
      };
    }
    let getInvalidBodyError = () => ({
      path,
      error: getInternalRouterError(400, {
        type: "invalid-body"
      })
    });

    // Create a Submission on non-GET navigations
    let rawFormMethod = opts.formMethod || "get";
    let formMethod = normalizeFormMethod ? rawFormMethod.toUpperCase() : rawFormMethod.toLowerCase();
    let formAction = stripHashFromPath(path);
    if (opts.body !== undefined) {
      if (opts.formEncType === "text/plain") {
        // text only support POST/PUT/PATCH/DELETE submissions
        if (!isMutationMethod(formMethod)) {
          return getInvalidBodyError();
        }
        let text = typeof opts.body === "string" ? opts.body : opts.body instanceof FormData || opts.body instanceof URLSearchParams ?
        // https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#plain-text-form-data
        Array.from(opts.body.entries()).reduce((acc, _ref3) => {
          let [name, value] = _ref3;
          return "" + acc + name + "=" + value + "\n";
        }, "") : String(opts.body);
        return {
          path,
          submission: {
            formMethod,
            formAction,
            formEncType: opts.formEncType,
            formData: undefined,
            json: undefined,
            text
          }
        };
      } else if (opts.formEncType === "application/json") {
        // json only supports POST/PUT/PATCH/DELETE submissions
        if (!isMutationMethod(formMethod)) {
          return getInvalidBodyError();
        }
        try {
          let json = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
          return {
            path,
            submission: {
              formMethod,
              formAction,
              formEncType: opts.formEncType,
              formData: undefined,
              json,
              text: undefined
            }
          };
        } catch (e) {
          return getInvalidBodyError();
        }
      }
    }
    invariant(typeof FormData === "function", "FormData is not available in this environment");
    let searchParams;
    let formData;
    if (opts.formData) {
      searchParams = convertFormDataToSearchParams(opts.formData);
      formData = opts.formData;
    } else if (opts.body instanceof FormData) {
      searchParams = convertFormDataToSearchParams(opts.body);
      formData = opts.body;
    } else if (opts.body instanceof URLSearchParams) {
      searchParams = opts.body;
      formData = convertSearchParamsToFormData(searchParams);
    } else if (opts.body == null) {
      searchParams = new URLSearchParams();
      formData = new FormData();
    } else {
      try {
        searchParams = new URLSearchParams(opts.body);
        formData = convertSearchParamsToFormData(searchParams);
      } catch (e) {
        return getInvalidBodyError();
      }
    }
    let submission = {
      formMethod,
      formAction,
      formEncType: opts && opts.formEncType || "application/x-www-form-urlencoded",
      formData,
      json: undefined,
      text: undefined
    };
    if (isMutationMethod(submission.formMethod)) {
      return {
        path,
        submission
      };
    }

    // Flatten submission onto URLSearchParams for GET submissions
    let parsedPath = parsePath(path);
    // On GET navigation submissions we can drop the ?index param from the
    // resulting location since all loaders will run.  But fetcher GET submissions
    // only run a single loader so we need to preserve any incoming ?index params
    if (isFetcher && parsedPath.search && hasNakedIndexQuery(parsedPath.search)) {
      searchParams.append("index", "");
    }
    parsedPath.search = "?" + searchParams;
    return {
      path: createPath(parsedPath),
      submission
    };
  }

  // Filter out all routes below any caught error as they aren't going to
  // render so we don't need to load them
  function getLoaderMatchesUntilBoundary(matches, boundaryId) {
    let boundaryMatches = matches;
    if (boundaryId) {
      let index = matches.findIndex(m => m.route.id === boundaryId);
      if (index >= 0) {
        boundaryMatches = matches.slice(0, index);
      }
    }
    return boundaryMatches;
  }
  function getMatchesToLoad(history, state, matches, submission, location, isInitialLoad, isRevalidationRequired, cancelledDeferredRoutes, cancelledFetcherLoads, deletedFetchers, fetchLoadMatches, fetchRedirectIds, routesToUse, basename, pendingActionData, pendingError) {
    let actionResult = pendingError ? Object.values(pendingError)[0] : pendingActionData ? Object.values(pendingActionData)[0] : undefined;
    let currentUrl = history.createURL(state.location);
    let nextUrl = history.createURL(location);

    // Pick navigation matches that are net-new or qualify for revalidation
    let boundaryId = pendingError ? Object.keys(pendingError)[0] : undefined;
    let boundaryMatches = getLoaderMatchesUntilBoundary(matches, boundaryId);
    let navigationMatches = boundaryMatches.filter((match, index) => {
      let {
        route
      } = match;
      if (route.lazy) {
        // We haven't loaded this route yet so we don't know if it's got a loader!
        return true;
      }
      if (route.loader == null) {
        return false;
      }
      if (isInitialLoad) {
        if (route.loader.hydrate) {
          return true;
        }
        return state.loaderData[route.id] === undefined && (
        // Don't re-run if the loader ran and threw an error
        !state.errors || state.errors[route.id] === undefined);
      }

      // Always call the loader on new route instances and pending defer cancellations
      if (isNewLoader(state.loaderData, state.matches[index], match) || cancelledDeferredRoutes.some(id => id === match.route.id)) {
        return true;
      }

      // This is the default implementation for when we revalidate.  If the route
      // provides it's own implementation, then we give them full control but
      // provide this value so they can leverage it if needed after they check
      // their own specific use cases
      let currentRouteMatch = state.matches[index];
      let nextRouteMatch = match;
      return shouldRevalidateLoader(match, _extends({
        currentUrl,
        currentParams: currentRouteMatch.params,
        nextUrl,
        nextParams: nextRouteMatch.params
      }, submission, {
        actionResult,
        defaultShouldRevalidate:
        // Forced revalidation due to submission, useRevalidator, or X-Remix-Revalidate
        isRevalidationRequired ||
        // Clicked the same link, resubmitted a GET form
        currentUrl.pathname + currentUrl.search === nextUrl.pathname + nextUrl.search ||
        // Search params affect all loaders
        currentUrl.search !== nextUrl.search || isNewRouteInstance(currentRouteMatch, nextRouteMatch)
      }));
    });

    // Pick fetcher.loads that need to be revalidated
    let revalidatingFetchers = [];
    fetchLoadMatches.forEach((f, key) => {
      // Don't revalidate:
      //  - on initial load (shouldn't be any fetchers then anyway)
      //  - if fetcher won't be present in the subsequent render
      //    - no longer matches the URL (v7_fetcherPersist=false)
      //    - was unmounted but persisted due to v7_fetcherPersist=true
      if (isInitialLoad || !matches.some(m => m.route.id === f.routeId) || deletedFetchers.has(key)) {
        return;
      }
      let fetcherMatches = matchRoutes(routesToUse, f.path, basename);

      // If the fetcher path no longer matches, push it in with null matches so
      // we can trigger a 404 in callLoadersAndMaybeResolveData.  Note this is
      // currently only a use-case for Remix HMR where the route tree can change
      // at runtime and remove a route previously loaded via a fetcher
      if (!fetcherMatches) {
        revalidatingFetchers.push({
          key,
          routeId: f.routeId,
          path: f.path,
          matches: null,
          match: null,
          controller: null
        });
        return;
      }

      // Revalidating fetchers are decoupled from the route matches since they
      // load from a static href.  They revalidate based on explicit revalidation
      // (submission, useRevalidator, or X-Remix-Revalidate)
      let fetcher = state.fetchers.get(key);
      let fetcherMatch = getTargetMatch(fetcherMatches, f.path);
      let shouldRevalidate = false;
      if (fetchRedirectIds.has(key)) {
        // Never trigger a revalidation of an actively redirecting fetcher
        shouldRevalidate = false;
      } else if (cancelledFetcherLoads.includes(key)) {
        // Always revalidate if the fetcher was cancelled
        shouldRevalidate = true;
      } else if (fetcher && fetcher.state !== "idle" && fetcher.data === undefined) {
        // If the fetcher hasn't ever completed loading yet, then this isn't a
        // revalidation, it would just be a brand new load if an explicit
        // revalidation is required
        shouldRevalidate = isRevalidationRequired;
      } else {
        // Otherwise fall back on any user-defined shouldRevalidate, defaulting
        // to explicit revalidations only
        shouldRevalidate = shouldRevalidateLoader(fetcherMatch, _extends({
          currentUrl,
          currentParams: state.matches[state.matches.length - 1].params,
          nextUrl,
          nextParams: matches[matches.length - 1].params
        }, submission, {
          actionResult,
          defaultShouldRevalidate: isRevalidationRequired
        }));
      }
      if (shouldRevalidate) {
        revalidatingFetchers.push({
          key,
          routeId: f.routeId,
          path: f.path,
          matches: fetcherMatches,
          match: fetcherMatch,
          controller: new AbortController()
        });
      }
    });
    return [navigationMatches, revalidatingFetchers];
  }
  function isNewLoader(currentLoaderData, currentMatch, match) {
    let isNew =
    // [a] -> [a, b]
    !currentMatch ||
    // [a, b] -> [a, c]
    match.route.id !== currentMatch.route.id;

    // Handle the case that we don't have data for a re-used route, potentially
    // from a prior error or from a cancelled pending deferred
    let isMissingData = currentLoaderData[match.route.id] === undefined;

    // Always load if this is a net-new route or we don't yet have data
    return isNew || isMissingData;
  }
  function isNewRouteInstance(currentMatch, match) {
    let currentPath = currentMatch.route.path;
    return (
      // param change for this match, /users/123 -> /users/456
      currentMatch.pathname !== match.pathname ||
      // splat param changed, which is not present in match.path
      // e.g. /files/images/avatar.jpg -> files/finances.xls
      currentPath != null && currentPath.endsWith("*") && currentMatch.params["*"] !== match.params["*"]
    );
  }
  function shouldRevalidateLoader(loaderMatch, arg) {
    if (loaderMatch.route.shouldRevalidate) {
      let routeChoice = loaderMatch.route.shouldRevalidate(arg);
      if (typeof routeChoice === "boolean") {
        return routeChoice;
      }
    }
    return arg.defaultShouldRevalidate;
  }

  /**
   * Execute route.lazy() methods to lazily load route modules (loader, action,
   * shouldRevalidate) and update the routeManifest in place which shares objects
   * with dataRoutes so those get updated as well.
   */
  async function loadLazyRouteModule(route, mapRouteProperties, manifest) {
    if (!route.lazy) {
      return;
    }
    let lazyRoute = await route.lazy();

    // If the lazy route function was executed and removed by another parallel
    // call then we can return - first lazy() to finish wins because the return
    // value of lazy is expected to be static
    if (!route.lazy) {
      return;
    }
    let routeToUpdate = manifest[route.id];
    invariant(routeToUpdate, "No route found in manifest");

    // Update the route in place.  This should be safe because there's no way
    // we could yet be sitting on this route as we can't get there without
    // resolving lazy() first.
    //
    // This is different than the HMR "update" use-case where we may actively be
    // on the route being updated.  The main concern boils down to "does this
    // mutation affect any ongoing navigations or any current state.matches
    // values?".  If not, it should be safe to update in place.
    let routeUpdates = {};
    for (let lazyRouteProperty in lazyRoute) {
      let staticRouteValue = routeToUpdate[lazyRouteProperty];
      let isPropertyStaticallyDefined = staticRouteValue !== undefined &&
      // This property isn't static since it should always be updated based
      // on the route updates
      lazyRouteProperty !== "hasErrorBoundary";
      warning(!isPropertyStaticallyDefined, "Route \"" + routeToUpdate.id + "\" has a static property \"" + lazyRouteProperty + "\" " + "defined but its lazy function is also returning a value for this property. " + ("The lazy route property \"" + lazyRouteProperty + "\" will be ignored."));
      if (!isPropertyStaticallyDefined && !immutableRouteKeys.has(lazyRouteProperty)) {
        routeUpdates[lazyRouteProperty] = lazyRoute[lazyRouteProperty];
      }
    }

    // Mutate the route with the provided updates.  Do this first so we pass
    // the updated version to mapRouteProperties
    Object.assign(routeToUpdate, routeUpdates);

    // Mutate the `hasErrorBoundary` property on the route based on the route
    // updates and remove the `lazy` function so we don't resolve the lazy
    // route again.
    Object.assign(routeToUpdate, _extends({}, mapRouteProperties(routeToUpdate), {
      lazy: undefined
    }));
  }
  async function callLoaderOrAction(type, request, match, matches, manifest, mapRouteProperties, basename, v7_relativeSplatPath, opts) {
    if (opts === void 0) {
      opts = {};
    }
    let resultType;
    let result;
    let onReject;
    let runHandler = handler => {
      // Setup a promise we can race against so that abort signals short circuit
      let reject;
      let abortPromise = new Promise((_, r) => reject = r);
      onReject = () => reject();
      request.signal.addEventListener("abort", onReject);
      return Promise.race([handler({
        request,
        params: match.params,
        context: opts.requestContext
      }), abortPromise]);
    };
    try {
      let handler = match.route[type];
      if (match.route.lazy) {
        if (handler) {
          // Run statically defined handler in parallel with lazy()
          let handlerError;
          let values = await Promise.all([
          // If the handler throws, don't let it immediately bubble out,
          // since we need to let the lazy() execution finish so we know if this
          // route has a boundary that can handle the error
          runHandler(handler).catch(e => {
            handlerError = e;
          }), loadLazyRouteModule(match.route, mapRouteProperties, manifest)]);
          if (handlerError) {
            throw handlerError;
          }
          result = values[0];
        } else {
          // Load lazy route module, then run any returned handler
          await loadLazyRouteModule(match.route, mapRouteProperties, manifest);
          handler = match.route[type];
          if (handler) {
            // Handler still run even if we got interrupted to maintain consistency
            // with un-abortable behavior of handler execution on non-lazy or
            // previously-lazy-loaded routes
            result = await runHandler(handler);
          } else if (type === "action") {
            let url = new URL(request.url);
            let pathname = url.pathname + url.search;
            throw getInternalRouterError(405, {
              method: request.method,
              pathname,
              routeId: match.route.id
            });
          } else {
            // lazy() route has no loader to run.  Short circuit here so we don't
            // hit the invariant below that errors on returning undefined.
            return {
              type: ResultType.data,
              data: undefined
            };
          }
        }
      } else if (!handler) {
        let url = new URL(request.url);
        let pathname = url.pathname + url.search;
        throw getInternalRouterError(404, {
          pathname
        });
      } else {
        result = await runHandler(handler);
      }
      invariant(result !== undefined, "You defined " + (type === "action" ? "an action" : "a loader") + " for route " + ("\"" + match.route.id + "\" but didn't return anything from your `" + type + "` ") + "function. Please return a value or `null`.");
    } catch (e) {
      resultType = ResultType.error;
      result = e;
    } finally {
      if (onReject) {
        request.signal.removeEventListener("abort", onReject);
      }
    }
    if (isResponse(result)) {
      let status = result.status;

      // Process redirects
      if (redirectStatusCodes.has(status)) {
        let location = result.headers.get("Location");
        invariant(location, "Redirects returned/thrown from loaders/actions must have a Location header");

        // Support relative routing in internal redirects
        if (!ABSOLUTE_URL_REGEX.test(location)) {
          location = normalizeTo(new URL(request.url), matches.slice(0, matches.indexOf(match) + 1), basename, true, location, v7_relativeSplatPath);
        } else if (!opts.isStaticRequest) {
          // Strip off the protocol+origin for same-origin + same-basename absolute
          // redirects. If this is a static request, we can let it go back to the
          // browser as-is
          let currentUrl = new URL(request.url);
          let url = location.startsWith("//") ? new URL(currentUrl.protocol + location) : new URL(location);
          let isSameBasename = stripBasename(url.pathname, basename) != null;
          if (url.origin === currentUrl.origin && isSameBasename) {
            location = url.pathname + url.search + url.hash;
          }
        }

        // Don't process redirects in the router during static requests requests.
        // Instead, throw the Response and let the server handle it with an HTTP
        // redirect.  We also update the Location header in place in this flow so
        // basename and relative routing is taken into account
        if (opts.isStaticRequest) {
          result.headers.set("Location", location);
          throw result;
        }
        return {
          type: ResultType.redirect,
          status,
          location,
          revalidate: result.headers.get("X-Remix-Revalidate") !== null,
          reloadDocument: result.headers.get("X-Remix-Reload-Document") !== null
        };
      }

      // For SSR single-route requests, we want to hand Responses back directly
      // without unwrapping.  We do this with the QueryRouteResponse wrapper
      // interface so we can know whether it was returned or thrown
      if (opts.isRouteRequest) {
        let queryRouteResponse = {
          type: resultType === ResultType.error ? ResultType.error : ResultType.data,
          response: result
        };
        throw queryRouteResponse;
      }
      let data;
      try {
        let contentType = result.headers.get("Content-Type");
        // Check between word boundaries instead of startsWith() due to the last
        // paragraph of https://httpwg.org/specs/rfc9110.html#field.content-type
        if (contentType && /\bapplication\/json\b/.test(contentType)) {
          if (result.body == null) {
            data = null;
          } else {
            data = await result.json();
          }
        } else {
          data = await result.text();
        }
      } catch (e) {
        return {
          type: ResultType.error,
          error: e
        };
      }
      if (resultType === ResultType.error) {
        return {
          type: resultType,
          error: new ErrorResponseImpl(status, result.statusText, data),
          headers: result.headers
        };
      }
      return {
        type: ResultType.data,
        data,
        statusCode: result.status,
        headers: result.headers
      };
    }
    if (resultType === ResultType.error) {
      return {
        type: resultType,
        error: result
      };
    }
    if (isDeferredData(result)) {
      var _result$init, _result$init2;
      return {
        type: ResultType.deferred,
        deferredData: result,
        statusCode: (_result$init = result.init) == null ? void 0 : _result$init.status,
        headers: ((_result$init2 = result.init) == null ? void 0 : _result$init2.headers) && new Headers(result.init.headers)
      };
    }
    return {
      type: ResultType.data,
      data: result
    };
  }

  // Utility method for creating the Request instances for loaders/actions during
  // client-side navigations and fetches.  During SSR we will always have a
  // Request instance from the static handler (query/queryRoute)
  function createClientSideRequest(history, location, signal, submission) {
    let url = history.createURL(stripHashFromPath(location)).toString();
    let init = {
      signal
    };
    if (submission && isMutationMethod(submission.formMethod)) {
      let {
        formMethod,
        formEncType
      } = submission;
      // Didn't think we needed this but it turns out unlike other methods, patch
      // won't be properly normalized to uppercase and results in a 405 error.
      // See: https://fetch.spec.whatwg.org/#concept-method
      init.method = formMethod.toUpperCase();
      if (formEncType === "application/json") {
        init.headers = new Headers({
          "Content-Type": formEncType
        });
        init.body = JSON.stringify(submission.json);
      } else if (formEncType === "text/plain") {
        // Content-Type is inferred (https://fetch.spec.whatwg.org/#dom-request)
        init.body = submission.text;
      } else if (formEncType === "application/x-www-form-urlencoded" && submission.formData) {
        // Content-Type is inferred (https://fetch.spec.whatwg.org/#dom-request)
        init.body = convertFormDataToSearchParams(submission.formData);
      } else {
        // Content-Type is inferred (https://fetch.spec.whatwg.org/#dom-request)
        init.body = submission.formData;
      }
    }
    return new Request(url, init);
  }
  function convertFormDataToSearchParams(formData) {
    let searchParams = new URLSearchParams();
    for (let [key, value] of formData.entries()) {
      // https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#converting-an-entry-list-to-a-list-of-name-value-pairs
      searchParams.append(key, typeof value === "string" ? value : value.name);
    }
    return searchParams;
  }
  function convertSearchParamsToFormData(searchParams) {
    let formData = new FormData();
    for (let [key, value] of searchParams.entries()) {
      formData.append(key, value);
    }
    return formData;
  }
  function processRouteLoaderData(matches, matchesToLoad, results, pendingError, activeDeferreds) {
    // Fill in loaderData/errors from our loaders
    let loaderData = {};
    let errors = null;
    let statusCode;
    let foundError = false;
    let loaderHeaders = {};

    // Process loader results into state.loaderData/state.errors
    results.forEach((result, index) => {
      let id = matchesToLoad[index].route.id;
      invariant(!isRedirectResult(result), "Cannot handle redirect results in processLoaderData");
      if (isErrorResult(result)) {
        // Look upwards from the matched route for the closest ancestor
        // error boundary, defaulting to the root match
        let boundaryMatch = findNearestBoundary(matches, id);
        let error = result.error;
        // If we have a pending action error, we report it at the highest-route
        // that throws a loader error, and then clear it out to indicate that
        // it was consumed
        if (pendingError) {
          error = Object.values(pendingError)[0];
          pendingError = undefined;
        }
        errors = errors || {};

        // Prefer higher error values if lower errors bubble to the same boundary
        if (errors[boundaryMatch.route.id] == null) {
          errors[boundaryMatch.route.id] = error;
        }

        // Clear our any prior loaderData for the throwing route
        loaderData[id] = undefined;

        // Once we find our first (highest) error, we set the status code and
        // prevent deeper status codes from overriding
        if (!foundError) {
          foundError = true;
          statusCode = isRouteErrorResponse(result.error) ? result.error.status : 500;
        }
        if (result.headers) {
          loaderHeaders[id] = result.headers;
        }
      } else {
        if (isDeferredResult(result)) {
          activeDeferreds.set(id, result.deferredData);
          loaderData[id] = result.deferredData.data;
        } else {
          loaderData[id] = result.data;
        }

        // Error status codes always override success status codes, but if all
        // loaders are successful we take the deepest status code.
        if (result.statusCode != null && result.statusCode !== 200 && !foundError) {
          statusCode = result.statusCode;
        }
        if (result.headers) {
          loaderHeaders[id] = result.headers;
        }
      }
    });

    // If we didn't consume the pending action error (i.e., all loaders
    // resolved), then consume it here.  Also clear out any loaderData for the
    // throwing route
    if (pendingError) {
      errors = pendingError;
      loaderData[Object.keys(pendingError)[0]] = undefined;
    }
    return {
      loaderData,
      errors,
      statusCode: statusCode || 200,
      loaderHeaders
    };
  }
  function processLoaderData(state, matches, matchesToLoad, results, pendingError, revalidatingFetchers, fetcherResults, activeDeferreds) {
    let {
      loaderData,
      errors
    } = processRouteLoaderData(matches, matchesToLoad, results, pendingError, activeDeferreds);

    // Process results from our revalidating fetchers
    for (let index = 0; index < revalidatingFetchers.length; index++) {
      let {
        key,
        match,
        controller
      } = revalidatingFetchers[index];
      invariant(fetcherResults !== undefined && fetcherResults[index] !== undefined, "Did not find corresponding fetcher result");
      let result = fetcherResults[index];

      // Process fetcher non-redirect errors
      if (controller && controller.signal.aborted) {
        // Nothing to do for aborted fetchers
        continue;
      } else if (isErrorResult(result)) {
        let boundaryMatch = findNearestBoundary(state.matches, match == null ? void 0 : match.route.id);
        if (!(errors && errors[boundaryMatch.route.id])) {
          errors = _extends({}, errors, {
            [boundaryMatch.route.id]: result.error
          });
        }
        state.fetchers.delete(key);
      } else if (isRedirectResult(result)) {
        // Should never get here, redirects should get processed above, but we
        // keep this to type narrow to a success result in the else
        invariant(false, "Unhandled fetcher revalidation redirect");
      } else if (isDeferredResult(result)) {
        // Should never get here, deferred data should be awaited for fetchers
        // in resolveDeferredResults
        invariant(false, "Unhandled fetcher deferred data");
      } else {
        let doneFetcher = getDoneFetcher(result.data);
        state.fetchers.set(key, doneFetcher);
      }
    }
    return {
      loaderData,
      errors
    };
  }
  function mergeLoaderData(loaderData, newLoaderData, matches, errors) {
    let mergedLoaderData = _extends({}, newLoaderData);
    for (let match of matches) {
      let id = match.route.id;
      if (newLoaderData.hasOwnProperty(id)) {
        if (newLoaderData[id] !== undefined) {
          mergedLoaderData[id] = newLoaderData[id];
        }
      } else if (loaderData[id] !== undefined && match.route.loader) {
        // Preserve existing keys not included in newLoaderData and where a loader
        // wasn't removed by HMR
        mergedLoaderData[id] = loaderData[id];
      }
      if (errors && errors.hasOwnProperty(id)) {
        // Don't keep any loader data below the boundary
        break;
      }
    }
    return mergedLoaderData;
  }

  // Find the nearest error boundary, looking upwards from the leaf route (or the
  // route specified by routeId) for the closest ancestor error boundary,
  // defaulting to the root match
  function findNearestBoundary(matches, routeId) {
    let eligibleMatches = routeId ? matches.slice(0, matches.findIndex(m => m.route.id === routeId) + 1) : [...matches];
    return eligibleMatches.reverse().find(m => m.route.hasErrorBoundary === true) || matches[0];
  }
  function getShortCircuitMatches(routes) {
    // Prefer a root layout route if present, otherwise shim in a route object
    let route = routes.length === 1 ? routes[0] : routes.find(r => r.index || !r.path || r.path === "/") || {
      id: "__shim-error-route__"
    };
    return {
      matches: [{
        params: {},
        pathname: "",
        pathnameBase: "",
        route
      }],
      route
    };
  }
  function getInternalRouterError(status, _temp5) {
    let {
      pathname,
      routeId,
      method,
      type
    } = _temp5 === void 0 ? {} : _temp5;
    let statusText = "Unknown Server Error";
    let errorMessage = "Unknown @remix-run/router error";
    if (status === 400) {
      statusText = "Bad Request";
      if (method && pathname && routeId) {
        errorMessage = "You made a " + method + " request to \"" + pathname + "\" but " + ("did not provide a `loader` for route \"" + routeId + "\", ") + "so there is no way to handle the request.";
      } else if (type === "defer-action") {
        errorMessage = "defer() is not supported in actions";
      } else if (type === "invalid-body") {
        errorMessage = "Unable to encode submission body";
      }
    } else if (status === 403) {
      statusText = "Forbidden";
      errorMessage = "Route \"" + routeId + "\" does not match URL \"" + pathname + "\"";
    } else if (status === 404) {
      statusText = "Not Found";
      errorMessage = "No route matches URL \"" + pathname + "\"";
    } else if (status === 405) {
      statusText = "Method Not Allowed";
      if (method && pathname && routeId) {
        errorMessage = "You made a " + method.toUpperCase() + " request to \"" + pathname + "\" but " + ("did not provide an `action` for route \"" + routeId + "\", ") + "so there is no way to handle the request.";
      } else if (method) {
        errorMessage = "Invalid request method \"" + method.toUpperCase() + "\"";
      }
    }
    return new ErrorResponseImpl(status || 500, statusText, new Error(errorMessage), true);
  }

  // Find any returned redirect errors, starting from the lowest match
  function findRedirect(results) {
    for (let i = results.length - 1; i >= 0; i--) {
      let result = results[i];
      if (isRedirectResult(result)) {
        return {
          result,
          idx: i
        };
      }
    }
  }
  function stripHashFromPath(path) {
    let parsedPath = typeof path === "string" ? parsePath(path) : path;
    return createPath(_extends({}, parsedPath, {
      hash: ""
    }));
  }
  function isHashChangeOnly(a, b) {
    if (a.pathname !== b.pathname || a.search !== b.search) {
      return false;
    }
    if (a.hash === "") {
      // /page -> /page#hash
      return b.hash !== "";
    } else if (a.hash === b.hash) {
      // /page#hash -> /page#hash
      return true;
    } else if (b.hash !== "") {
      // /page#hash -> /page#other
      return true;
    }

    // If the hash is removed the browser will re-perform a request to the server
    // /page#hash -> /page
    return false;
  }
  function isDeferredResult(result) {
    return result.type === ResultType.deferred;
  }
  function isErrorResult(result) {
    return result.type === ResultType.error;
  }
  function isRedirectResult(result) {
    return (result && result.type) === ResultType.redirect;
  }
  function isDeferredData(value) {
    let deferred = value;
    return deferred && typeof deferred === "object" && typeof deferred.data === "object" && typeof deferred.subscribe === "function" && typeof deferred.cancel === "function" && typeof deferred.resolveData === "function";
  }
  function isResponse(value) {
    return value != null && typeof value.status === "number" && typeof value.statusText === "string" && typeof value.headers === "object" && typeof value.body !== "undefined";
  }
  function isRedirectResponse(result) {
    if (!isResponse(result)) {
      return false;
    }
    let status = result.status;
    let location = result.headers.get("Location");
    return status >= 300 && status <= 399 && location != null;
  }
  function isQueryRouteResponse(obj) {
    return obj && isResponse(obj.response) && (obj.type === ResultType.data || obj.type === ResultType.error);
  }
  function isValidMethod(method) {
    return validRequestMethods.has(method.toLowerCase());
  }
  function isMutationMethod(method) {
    return validMutationMethods.has(method.toLowerCase());
  }
  async function resolveDeferredResults(currentMatches, matchesToLoad, results, signals, isFetcher, currentLoaderData) {
    for (let index = 0; index < results.length; index++) {
      let result = results[index];
      let match = matchesToLoad[index];
      // If we don't have a match, then we can have a deferred result to do
      // anything with.  This is for revalidating fetchers where the route was
      // removed during HMR
      if (!match) {
        continue;
      }
      let currentMatch = currentMatches.find(m => m.route.id === match.route.id);
      let isRevalidatingLoader = currentMatch != null && !isNewRouteInstance(currentMatch, match) && (currentLoaderData && currentLoaderData[match.route.id]) !== undefined;
      if (isDeferredResult(result) && (isFetcher || isRevalidatingLoader)) {
        // Note: we do not have to touch activeDeferreds here since we race them
        // against the signal in resolveDeferredData and they'll get aborted
        // there if needed
        let signal = signals[index];
        invariant(signal, "Expected an AbortSignal for revalidating fetcher deferred result");
        await resolveDeferredData(result, signal, isFetcher).then(result => {
          if (result) {
            results[index] = result || results[index];
          }
        });
      }
    }
  }
  async function resolveDeferredData(result, signal, unwrap) {
    if (unwrap === void 0) {
      unwrap = false;
    }
    let aborted = await result.deferredData.resolveData(signal);
    if (aborted) {
      return;
    }
    if (unwrap) {
      try {
        return {
          type: ResultType.data,
          data: result.deferredData.unwrappedData
        };
      } catch (e) {
        // Handle any TrackedPromise._error values encountered while unwrapping
        return {
          type: ResultType.error,
          error: e
        };
      }
    }
    return {
      type: ResultType.data,
      data: result.deferredData.data
    };
  }
  function hasNakedIndexQuery(search) {
    return new URLSearchParams(search).getAll("index").some(v => v === "");
  }
  function getTargetMatch(matches, location) {
    let search = typeof location === "string" ? parsePath(location).search : location.search;
    if (matches[matches.length - 1].route.index && hasNakedIndexQuery(search || "")) {
      // Return the leaf index route when index is present
      return matches[matches.length - 1];
    }
    // Otherwise grab the deepest "path contributing" match (ignoring index and
    // pathless layout routes)
    let pathMatches = getPathContributingMatches(matches);
    return pathMatches[pathMatches.length - 1];
  }
  function getSubmissionFromNavigation(navigation) {
    let {
      formMethod,
      formAction,
      formEncType,
      text,
      formData,
      json
    } = navigation;
    if (!formMethod || !formAction || !formEncType) {
      return;
    }
    if (text != null) {
      return {
        formMethod,
        formAction,
        formEncType,
        formData: undefined,
        json: undefined,
        text
      };
    } else if (formData != null) {
      return {
        formMethod,
        formAction,
        formEncType,
        formData,
        json: undefined,
        text: undefined
      };
    } else if (json !== undefined) {
      return {
        formMethod,
        formAction,
        formEncType,
        formData: undefined,
        json,
        text: undefined
      };
    }
  }
  function getLoadingNavigation(location, submission) {
    if (submission) {
      let navigation = {
        state: "loading",
        location,
        formMethod: submission.formMethod,
        formAction: submission.formAction,
        formEncType: submission.formEncType,
        formData: submission.formData,
        json: submission.json,
        text: submission.text
      };
      return navigation;
    } else {
      let navigation = {
        state: "loading",
        location,
        formMethod: undefined,
        formAction: undefined,
        formEncType: undefined,
        formData: undefined,
        json: undefined,
        text: undefined
      };
      return navigation;
    }
  }
  function getSubmittingNavigation(location, submission) {
    let navigation = {
      state: "submitting",
      location,
      formMethod: submission.formMethod,
      formAction: submission.formAction,
      formEncType: submission.formEncType,
      formData: submission.formData,
      json: submission.json,
      text: submission.text
    };
    return navigation;
  }
  function getLoadingFetcher(submission, data) {
    if (submission) {
      let fetcher = {
        state: "loading",
        formMethod: submission.formMethod,
        formAction: submission.formAction,
        formEncType: submission.formEncType,
        formData: submission.formData,
        json: submission.json,
        text: submission.text,
        data
      };
      return fetcher;
    } else {
      let fetcher = {
        state: "loading",
        formMethod: undefined,
        formAction: undefined,
        formEncType: undefined,
        formData: undefined,
        json: undefined,
        text: undefined,
        data
      };
      return fetcher;
    }
  }
  function getSubmittingFetcher(submission, existingFetcher) {
    let fetcher = {
      state: "submitting",
      formMethod: submission.formMethod,
      formAction: submission.formAction,
      formEncType: submission.formEncType,
      formData: submission.formData,
      json: submission.json,
      text: submission.text,
      data: existingFetcher ? existingFetcher.data : undefined
    };
    return fetcher;
  }
  function getDoneFetcher(data) {
    let fetcher = {
      state: "idle",
      formMethod: undefined,
      formAction: undefined,
      formEncType: undefined,
      formData: undefined,
      json: undefined,
      text: undefined,
      data
    };
    return fetcher;
  }
  function restoreAppliedTransitions(_window, transitions) {
    try {
      let sessionPositions = _window.sessionStorage.getItem(TRANSITIONS_STORAGE_KEY);
      if (sessionPositions) {
        let json = JSON.parse(sessionPositions);
        for (let [k, v] of Object.entries(json || {})) {
          if (v && Array.isArray(v)) {
            transitions.set(k, new Set(v || []));
          }
        }
      }
    } catch (e) {
      // no-op, use default empty object
    }
  }
  function persistAppliedTransitions(_window, transitions) {
    if (transitions.size > 0) {
      let json = {};
      for (let [k, v] of transitions) {
        json[k] = [...v];
      }
      try {
        _window.sessionStorage.setItem(TRANSITIONS_STORAGE_KEY, JSON.stringify(json));
      } catch (error) {
        warning(false, "Failed to save applied view transitions in sessionStorage (" + error + ").");
      }
    }
  }

  //#endregion

  exports.AbortedDeferredError = AbortedDeferredError;
  exports.Action = Action;
  exports.IDLE_BLOCKER = IDLE_BLOCKER;
  exports.IDLE_FETCHER = IDLE_FETCHER;
  exports.IDLE_NAVIGATION = IDLE_NAVIGATION;
  exports.UNSAFE_DEFERRED_SYMBOL = UNSAFE_DEFERRED_SYMBOL;
  exports.UNSAFE_DeferredData = DeferredData;
  exports.UNSAFE_ErrorResponseImpl = ErrorResponseImpl;
  exports.UNSAFE_convertRouteMatchToUiMatch = convertRouteMatchToUiMatch;
  exports.UNSAFE_convertRoutesToDataRoutes = convertRoutesToDataRoutes;
  exports.UNSAFE_getResolveToMatches = getResolveToMatches;
  exports.UNSAFE_invariant = invariant;
  exports.UNSAFE_warning = warning;
  exports.createBrowserHistory = createBrowserHistory;
  exports.createHashHistory = createHashHistory;
  exports.createMemoryHistory = createMemoryHistory;
  exports.createPath = createPath;
  exports.createRouter = createRouter;
  exports.createStaticHandler = createStaticHandler;
  exports.defer = defer;
  exports.generatePath = generatePath;
  exports.getStaticContextFromError = getStaticContextFromError;
  exports.getToPathname = getToPathname;
  exports.isDeferredData = isDeferredData;
  exports.isRouteErrorResponse = isRouteErrorResponse;
  exports.joinPaths = joinPaths;
  exports.json = json;
  exports.matchPath = matchPath;
  exports.matchRoutes = matchRoutes;
  exports.normalizePathname = normalizePathname;
  exports.parsePath = parsePath;
  exports.redirect = redirect;
  exports.redirectDocument = redirectDocument;
  exports.resolvePath = resolvePath;
  exports.resolveTo = resolveTo;
  exports.stripBasename = stripBasename;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=router.umd.js.map
