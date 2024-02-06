(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@floating-ui/dom'), require('react'), require('react-dom')) :
  typeof define === 'function' && define.amd ? define(['exports', '@floating-ui/dom', 'react', 'react-dom'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.FloatingUIReactDOM = {}, global.FloatingUIDOM, global.React, global.ReactDOM));
})(this, (function (exports, dom, React, ReactDOM) { 'use strict';

  function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
        }
      });
    }
    n.default = e;
    return Object.freeze(n);
  }

  var React__namespace = /*#__PURE__*/_interopNamespaceDefault(React);
  var ReactDOM__namespace = /*#__PURE__*/_interopNamespaceDefault(ReactDOM);

  /**
   * Provides data to position an inner element of the floating element so that it
   * appears centered to the reference element.
   * This wraps the core `arrow` middleware to allow React refs as the element.
   * @see https://floating-ui.com/docs/arrow
   */
  const arrow = options => {
    function isRef(value) {
      return {}.hasOwnProperty.call(value, 'current');
    }
    return {
      name: 'arrow',
      options,
      fn(state) {
        const {
          element,
          padding
        } = typeof options === 'function' ? options(state) : options;
        if (element && isRef(element)) {
          if (element.current != null) {
            return dom.arrow({
              element: element.current,
              padding
            }).fn(state);
          }
          return {};
        }
        if (element) {
          return dom.arrow({
            element,
            padding
          }).fn(state);
        }
        return {};
      }
    };
  };

  var index = typeof document !== 'undefined' ? React.useLayoutEffect : React.useEffect;

  // Fork of `fast-deep-equal` that only does the comparisons we need and compares
  // functions
  function deepEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (typeof a !== typeof b) {
      return false;
    }
    if (typeof a === 'function' && a.toString() === b.toString()) {
      return true;
    }
    let length;
    let i;
    let keys;
    if (a && b && typeof a === 'object') {
      if (Array.isArray(a)) {
        length = a.length;
        if (length !== b.length) return false;
        for (i = length; i-- !== 0;) {
          if (!deepEqual(a[i], b[i])) {
            return false;
          }
        }
        return true;
      }
      keys = Object.keys(a);
      length = keys.length;
      if (length !== Object.keys(b).length) {
        return false;
      }
      for (i = length; i-- !== 0;) {
        if (!{}.hasOwnProperty.call(b, keys[i])) {
          return false;
        }
      }
      for (i = length; i-- !== 0;) {
        const key = keys[i];
        if (key === '_owner' && a.$$typeof) {
          continue;
        }
        if (!deepEqual(a[key], b[key])) {
          return false;
        }
      }
      return true;
    }

    // biome-ignore lint/suspicious/noSelfCompare: in source
    return a !== a && b !== b;
  }

  function getDPR(element) {
    if (typeof window === 'undefined') {
      return 1;
    }
    const win = element.ownerDocument.defaultView || window;
    return win.devicePixelRatio || 1;
  }

  function roundByDPR(element, value) {
    const dpr = getDPR(element);
    return Math.round(value * dpr) / dpr;
  }

  function useLatestRef(value) {
    const ref = React__namespace.useRef(value);
    index(() => {
      ref.current = value;
    });
    return ref;
  }

  /**
   * Provides data to position a floating element.
   * @see https://floating-ui.com/docs/useFloating
   */
  function useFloating(options) {
    if (options === void 0) {
      options = {};
    }
    const {
      placement = 'bottom',
      strategy = 'absolute',
      middleware = [],
      platform,
      elements: {
        reference: externalReference,
        floating: externalFloating
      } = {},
      transform = true,
      whileElementsMounted,
      open
    } = options;
    const [data, setData] = React__namespace.useState({
      x: 0,
      y: 0,
      strategy,
      placement,
      middlewareData: {},
      isPositioned: false
    });
    const [latestMiddleware, setLatestMiddleware] = React__namespace.useState(middleware);
    if (!deepEqual(latestMiddleware, middleware)) {
      setLatestMiddleware(middleware);
    }
    const [_reference, _setReference] = React__namespace.useState(null);
    const [_floating, _setFloating] = React__namespace.useState(null);
    const setReference = React__namespace.useCallback(node => {
      if (node !== referenceRef.current) {
        referenceRef.current = node;
        _setReference(node);
      }
    }, []);
    const setFloating = React__namespace.useCallback(node => {
      if (node !== floatingRef.current) {
        floatingRef.current = node;
        _setFloating(node);
      }
    }, []);
    const referenceEl = externalReference || _reference;
    const floatingEl = externalFloating || _floating;
    const referenceRef = React__namespace.useRef(null);
    const floatingRef = React__namespace.useRef(null);
    const dataRef = React__namespace.useRef(data);
    const hasWhileElementsMounted = whileElementsMounted != null;
    const whileElementsMountedRef = useLatestRef(whileElementsMounted);
    const platformRef = useLatestRef(platform);
    const update = React__namespace.useCallback(() => {
      if (!referenceRef.current || !floatingRef.current) {
        return;
      }
      const config = {
        placement,
        strategy,
        middleware: latestMiddleware
      };
      if (platformRef.current) {
        config.platform = platformRef.current;
      }
      dom.computePosition(referenceRef.current, floatingRef.current, config).then(data => {
        const fullData = {
          ...data,
          isPositioned: true
        };
        if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
          dataRef.current = fullData;
          ReactDOM__namespace.flushSync(() => {
            setData(fullData);
          });
        }
      });
    }, [latestMiddleware, placement, strategy, platformRef]);
    index(() => {
      if (open === false && dataRef.current.isPositioned) {
        dataRef.current.isPositioned = false;
        setData(data => ({
          ...data,
          isPositioned: false
        }));
      }
    }, [open]);
    const isMountedRef = React__namespace.useRef(false);
    index(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: `hasWhileElementsMounted` is intentionally included.
    index(() => {
      if (referenceEl) referenceRef.current = referenceEl;
      if (floatingEl) floatingRef.current = floatingEl;
      if (referenceEl && floatingEl) {
        if (whileElementsMountedRef.current) {
          return whileElementsMountedRef.current(referenceEl, floatingEl, update);
        }
        update();
      }
    }, [referenceEl, floatingEl, update, whileElementsMountedRef, hasWhileElementsMounted]);
    const refs = React__namespace.useMemo(() => ({
      reference: referenceRef,
      floating: floatingRef,
      setReference,
      setFloating
    }), [setReference, setFloating]);
    const elements = React__namespace.useMemo(() => ({
      reference: referenceEl,
      floating: floatingEl
    }), [referenceEl, floatingEl]);
    const floatingStyles = React__namespace.useMemo(() => {
      const initialStyles = {
        position: strategy,
        left: 0,
        top: 0
      };
      if (!elements.floating) {
        return initialStyles;
      }
      const x = roundByDPR(elements.floating, data.x);
      const y = roundByDPR(elements.floating, data.y);
      if (transform) {
        return {
          ...initialStyles,
          transform: "translate(" + x + "px, " + y + "px)",
          ...(getDPR(elements.floating) >= 1.5 && {
            willChange: 'transform'
          })
        };
      }
      return {
        position: strategy,
        left: x,
        top: y
      };
    }, [strategy, transform, elements.floating, data.x, data.y]);
    return React__namespace.useMemo(() => ({
      ...data,
      update,
      refs,
      elements,
      floatingStyles
    }), [data, update, refs, elements, floatingStyles]);
  }

  Object.defineProperty(exports, "autoPlacement", {
    enumerable: true,
    get: function () { return dom.autoPlacement; }
  });
  Object.defineProperty(exports, "autoUpdate", {
    enumerable: true,
    get: function () { return dom.autoUpdate; }
  });
  Object.defineProperty(exports, "computePosition", {
    enumerable: true,
    get: function () { return dom.computePosition; }
  });
  Object.defineProperty(exports, "detectOverflow", {
    enumerable: true,
    get: function () { return dom.detectOverflow; }
  });
  Object.defineProperty(exports, "flip", {
    enumerable: true,
    get: function () { return dom.flip; }
  });
  Object.defineProperty(exports, "getOverflowAncestors", {
    enumerable: true,
    get: function () { return dom.getOverflowAncestors; }
  });
  Object.defineProperty(exports, "hide", {
    enumerable: true,
    get: function () { return dom.hide; }
  });
  Object.defineProperty(exports, "inline", {
    enumerable: true,
    get: function () { return dom.inline; }
  });
  Object.defineProperty(exports, "limitShift", {
    enumerable: true,
    get: function () { return dom.limitShift; }
  });
  Object.defineProperty(exports, "offset", {
    enumerable: true,
    get: function () { return dom.offset; }
  });
  Object.defineProperty(exports, "platform", {
    enumerable: true,
    get: function () { return dom.platform; }
  });
  Object.defineProperty(exports, "shift", {
    enumerable: true,
    get: function () { return dom.shift; }
  });
  Object.defineProperty(exports, "size", {
    enumerable: true,
    get: function () { return dom.size; }
  });
  exports.arrow = arrow;
  exports.useFloating = useFloating;

}));
