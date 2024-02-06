import * as React from 'react';
import SuperJSON from 'superjson';
import { useTheme } from './theme.mjs';
import useMediaQuery from './useMediaQuery.mjs';

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
  return /*#__PURE__*/React.forwardRef(({
    style,
    ...rest
  }, ref) => {
    const theme = useTheme();
    const mediaStyles = Object.entries(queries).reduce((current, [key, value]) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useMediaQuery(key) ? { ...current,
        ...(typeof value === 'function' ? value(rest, theme) : value)
      } : current;
    }, {});
    return /*#__PURE__*/React.createElement(type, { ...rest,
      style: { ...(typeof newStyles === 'function' ? newStyles(rest, theme) : newStyles),
        ...style,
        ...mediaStyles
      },
      ref
    });
  });
}
function useIsMounted() {
  const mountedRef = React.useRef(false);
  const isMounted = React.useCallback(() => mountedRef.current, []);
  React.useEffect(() => {
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
  } = SuperJSON.serialize(value);
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

export { defaultPanelSize, displayValue, getOppositeSide, getQueryStatusColor, getQueryStatusLabel, getResizeHandleStyle, getSidePanelStyle, getSidedProp, isVerticalSide, minPanelSize, sides, sortFns, styled, useIsMounted };
//# sourceMappingURL=utils.mjs.map
