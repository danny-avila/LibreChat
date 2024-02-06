'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var React = require('react');
var SuperJSON = require('superjson');
var theme = require('./theme.js');
var useMediaQuery = require('./useMediaQuery.js');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

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
var SuperJSON__default = /*#__PURE__*/_interopDefaultLegacy(SuperJSON);

function getQueryStatusColor({
  queryState,
  observerCount,
  isStale,
  theme
}) {
  return queryState.fetchStatus === 'fetching' ? theme.active : !observerCount ? theme.gray : queryState.fetchStatus === 'paused' ? theme.paused : isStale ? theme.warning : theme.success;
}
function getQueryStatusLabel(query) {
  return query.state.fetchStatus === 'fetching' ? 'fetching' : !query.getObserversCount() ? 'inactive' : query.state.fetchStatus === 'paused' ? 'paused' : query.isStale() ? 'stale' : 'fresh';
}
function styled(type, newStyles, queries = {}) {
  return /*#__PURE__*/React__namespace.forwardRef(({
    style,
    ...rest
  }, ref) => {
    const theme$1 = theme.useTheme();
    const mediaStyles = Object.entries(queries).reduce((current, [key, value]) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useMediaQuery["default"](key) ? { ...current,
        ...(typeof value === 'function' ? value(rest, theme$1) : value)
      } : current;
    }, {});
    return /*#__PURE__*/React__namespace.createElement(type, { ...rest,
      style: { ...(typeof newStyles === 'function' ? newStyles(rest, theme$1) : newStyles),
        ...style,
        ...mediaStyles
      },
      ref
    });
  });
}
function useIsMounted() {
  const mountedRef = React__namespace.useRef(false);
  const isMounted = React__namespace.useCallback(() => mountedRef.current, []);
  React__namespace.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return isMounted;
}
/**
 * Displays a string regardless the type of the data
 * @param {unknown} value Value to be stringified
 * @param {boolean} beautify Formats json to multiline
 */

const displayValue = (value, beautify = false) => {
  const {
    json
  } = SuperJSON__default["default"].serialize(value);
  return JSON.stringify(json, null, beautify ? 2 : undefined);
}; // Sorting functions

const getStatusRank = q => q.state.fetchStatus !== 'idle' ? 0 : !q.getObserversCount() ? 3 : q.isStale() ? 2 : 1;

const queryHashSort = (a, b) => a.queryHash.localeCompare(b.queryHash);

const dateSort = (a, b) => a.state.dataUpdatedAt < b.state.dataUpdatedAt ? 1 : -1;

const statusAndDateSort = (a, b) => {
  if (getStatusRank(a) === getStatusRank(b)) {
    return dateSort(a, b);
  }

  return getStatusRank(a) > getStatusRank(b) ? 1 : -1;
};

const sortFns = {
  'Status > Last Updated': statusAndDateSort,
  'Query Hash': queryHashSort,
  'Last Updated': dateSort
};
const minPanelSize = 70;
const defaultPanelSize = 500;
const sides = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left'
};

/**
 * Check if the given side is vertical (left/right)
 */
function isVerticalSide(side) {
  return ['left', 'right'].includes(side);
}
/**
 * Get the opposite side, eg 'left' => 'right'. 'top' => 'bottom', etc
 */

function getOppositeSide(side) {
  return sides[side];
}
/**
 * Given as css prop it will return a sided css prop based on a given side
 * Example given `border` and `right` it return `borderRight`
 */

function getSidedProp(prop, side) {
  return "" + prop + (side.charAt(0).toUpperCase() + side.slice(1));
}
function getSidePanelStyle({
  position = 'bottom',
  height,
  width,
  devtoolsTheme,
  isOpen,
  isResizing,
  panelStyle
}) {
  const oppositeSide = getOppositeSide(position);
  const borderSide = getSidedProp('border', oppositeSide);
  const isVertical = isVerticalSide(position);
  return { ...panelStyle,
    direction: 'ltr',
    position: 'fixed',
    [position]: 0,
    [borderSide]: "1px solid " + devtoolsTheme.gray,
    transformOrigin: oppositeSide,
    boxShadow: '0 0 20px rgba(0,0,0,.3)',
    zIndex: 99999,
    // visibility will be toggled after transitions, but set initial state here
    visibility: isOpen ? 'visible' : 'hidden',
    ...(isResizing ? {
      transition: "none"
    } : {
      transition: "all .2s ease"
    }),
    ...(isOpen ? {
      opacity: 1,
      pointerEvents: 'all',
      transform: isVertical ? "translateX(0) scale(1)" : "translateY(0) scale(1)"
    } : {
      opacity: 0,
      pointerEvents: 'none',
      transform: isVertical ? "translateX(15px) scale(1.02)" : "translateY(15px) scale(1.02)"
    }),
    ...(isVertical ? {
      top: 0,
      height: '100vh',
      maxWidth: '90%',
      width: typeof width === 'number' && width >= minPanelSize ? width : defaultPanelSize
    } : {
      left: 0,
      width: '100%',
      maxHeight: '90%',
      height: typeof height === 'number' && height >= minPanelSize ? height : defaultPanelSize
    })
  };
}
/**
 * Get resize handle style based on a given side
 */

function getResizeHandleStyle(position = 'bottom') {
  const isVertical = isVerticalSide(position);
  const oppositeSide = getOppositeSide(position);
  const marginSide = getSidedProp('margin', oppositeSide);
  return {
    position: 'absolute',
    cursor: isVertical ? 'col-resize' : 'row-resize',
    zIndex: 100000,
    [oppositeSide]: 0,
    [marginSide]: "-4px",
    ...(isVertical ? {
      top: 0,
      height: '100%',
      width: '4px'
    } : {
      width: '100%',
      height: '4px'
    })
  };
}

exports.defaultPanelSize = defaultPanelSize;
exports.displayValue = displayValue;
exports.getOppositeSide = getOppositeSide;
exports.getQueryStatusColor = getQueryStatusColor;
exports.getQueryStatusLabel = getQueryStatusLabel;
exports.getResizeHandleStyle = getResizeHandleStyle;
exports.getSidePanelStyle = getSidePanelStyle;
exports.getSidedProp = getSidedProp;
exports.isVerticalSide = isVerticalSide;
exports.minPanelSize = minPanelSize;
exports.sides = sides;
exports.sortFns = sortFns;
exports.styled = styled;
exports.useIsMounted = useIsMounted;
//# sourceMappingURL=utils.js.map
