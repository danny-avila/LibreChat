'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var React = require('react');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
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
  n["default"] = e;
  return Object.freeze(n);
}

var React__namespace = /*#__PURE__*/_interopNamespace(React);

function useMediaQuery(query) {
  // Keep track of the preference in state, start with the current match
  const [isMatch, setIsMatch] = React__namespace.useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }

    return;
  }); // Watch for changes

  React__namespace.useEffect(() => {
    if (typeof window !== 'undefined') {
      // Create a matcher
      const matcher = window.matchMedia(query); // Create our handler

      const onChange = ({
        matches
      }) => setIsMatch(matches); // Listen for changes


      matcher.addListener(onChange);
      return () => {
        // Stop listening for changes
        matcher.removeListener(onChange);
      };
    }

    return;
  }, [isMatch, query, setIsMatch]);
  return isMatch;
}

exports["default"] = useMediaQuery;
//# sourceMappingURL=useMediaQuery.js.map
