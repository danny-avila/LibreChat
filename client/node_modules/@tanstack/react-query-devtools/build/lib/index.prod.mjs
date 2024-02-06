import * as React from 'react';
import { useMemo } from 'react';
import { useQueryClient, onlineManager, notifyManager } from '@tanstack/react-query';
import { rankItem } from '@tanstack/match-sorter-utils';
import SuperJSON from 'superjson';
import { useSyncExternalStore } from 'use-sync-external-store/shim/index.js';

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

const getItem = key => {
  try {
    const itemValue = localStorage.getItem(key);

    if (typeof itemValue === 'string') {
      return JSON.parse(itemValue);
    }

    return undefined;
  } catch {
    return undefined;
  }
};

function useLocalStorage(key, defaultValue) {
  const [value, setValue] = React.useState();
  React.useEffect(() => {
    const initialValue = getItem(key);

    if (typeof initialValue === 'undefined' || initialValue === null) {
      setValue(typeof defaultValue === 'function' ? defaultValue() : defaultValue);
    } else {
      setValue(initialValue);
    }
  }, [defaultValue, key]);
  const setter = React.useCallback(updater => {
    setValue(old => {
      let newVal = updater;

      if (typeof updater == 'function') {
        newVal = updater(old);
      }

      try {
        localStorage.setItem(key, JSON.stringify(newVal));
      } catch {}

      return newVal;
    });
  }, [key]);
  return [value, setter];
}

const defaultTheme = {
  background: '#0b1521',
  backgroundAlt: '#132337',
  foreground: 'white',
  gray: '#3f4e60',
  grayAlt: '#222e3e',
  inputBackgroundColor: '#fff',
  inputTextColor: '#000',
  success: '#00ab52',
  danger: '#ff0085',
  active: '#006bff',
  paused: '#8c49eb',
  warning: '#ffb200'
};
const ThemeContext = /*#__PURE__*/React.createContext(defaultTheme);
function ThemeProvider({
  theme,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(ThemeContext.Provider, _extends({
    value: theme
  }, rest));
}
function useTheme() {
  return React.useContext(ThemeContext);
}

function useMediaQuery(query) {
  // Keep track of the preference in state, start with the current match
  const [isMatch, setIsMatch] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }

    return;
  }); // Watch for changes

  React.useEffect(() => {
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

const Panel = styled('div', (_props, theme) => ({
  fontSize: 'clamp(12px, 1.5vw, 14px)',
  fontFamily: "sans-serif",
  display: 'flex',
  backgroundColor: theme.background,
  color: theme.foreground
}), {
  '(max-width: 700px)': {
    flexDirection: 'column'
  },
  '(max-width: 600px)': {
    fontSize: '.9em' // flexDirection: 'column',

  }
});
const ActiveQueryPanel = styled('div', () => ({
  flex: '1 1 500px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
  height: '100%'
}), {
  '(max-width: 700px)': (_props, theme) => ({
    borderTop: "2px solid " + theme.gray
  })
});
const Button = styled('button', (props, theme) => ({
  appearance: 'none',
  fontSize: '.9em',
  fontWeight: 'bold',
  background: theme.gray,
  border: '0',
  borderRadius: '.3em',
  color: 'white',
  padding: '.5em',
  opacity: props.disabled ? '.5' : undefined,
  cursor: 'pointer'
}));
const QueryKeys = styled('span', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5em',
  fontSize: '0.9em'
});
const QueryKey = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '.2em .4em',
  fontWeight: 'bold',
  textShadow: '0 0 10px black',
  borderRadius: '.2em'
});
const Code = styled('code', {
  fontSize: '.9em',
  color: 'inherit',
  background: 'inherit'
});
const Input = styled('input', (_props, theme) => ({
  backgroundColor: theme.inputBackgroundColor,
  border: 0,
  borderRadius: '.2em',
  color: theme.inputTextColor,
  fontSize: '.9em',
  lineHeight: "1.3",
  padding: '.3em .4em'
}));
const Select = styled('select', (_props, theme) => ({
  display: "inline-block",
  fontSize: ".9em",
  fontFamily: "sans-serif",
  fontWeight: 'normal',
  lineHeight: "1.3",
  padding: ".3em 1.5em .3em .5em",
  height: 'auto',
  border: 0,
  borderRadius: ".2em",
  appearance: "none",
  WebkitAppearance: 'none',
  backgroundColor: theme.inputBackgroundColor,
  backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23444444'><polygon points='0,25 100,25 50,75'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right .55em center",
  backgroundSize: ".65em auto, 100%",
  color: theme.inputTextColor
}), {
  '(max-width: 500px)': {
    display: 'none'
  }
});

function ScreenReader({
  text
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      width: '0.1px',
      height: '0.1px',
      overflow: 'hidden'
    }
  }, text);
}

const Entry = styled('div', {
  fontFamily: 'Menlo, monospace',
  fontSize: '1em',
  lineHeight: '1.7',
  outline: 'none',
  wordBreak: 'break-word'
});
const Label = styled('span', {
  color: 'white'
});
const LabelButton = styled('button', {
  cursor: 'pointer',
  color: 'white'
});
const ExpandButton = styled('button', {
  cursor: 'pointer',
  color: 'inherit',
  font: 'inherit',
  outline: 'inherit',
  background: 'transparent',
  border: 'none',
  padding: 0
});
const CopyButton = ({
  value
}) => {
  const [copyState, setCopyState] = React.useState('NoCopy');
  return /*#__PURE__*/React.createElement("button", {
    onClick: copyState === 'NoCopy' ? () => {
      navigator.clipboard.writeText(SuperJSON.stringify(value)).then(() => {
        setCopyState('SuccessCopy');
        setTimeout(() => {
          setCopyState('NoCopy');
        }, 1500);
      }, err => {
        console.error('Failed to copy: ', err);
        setCopyState('ErrorCopy');
        setTimeout(() => {
          setCopyState('NoCopy');
        }, 1500);
      });
    } : undefined,
    style: {
      cursor: 'pointer',
      color: 'inherit',
      font: 'inherit',
      outline: 'inherit',
      background: 'transparent',
      border: 'none',
      padding: 0
    }
  }, copyState === 'NoCopy' ? /*#__PURE__*/React.createElement(Copier, null) : copyState === 'SuccessCopy' ? /*#__PURE__*/React.createElement(CopiedCopier, null) : /*#__PURE__*/React.createElement(ErrorCopier, null));
};
const Value = styled('span', (_props, theme) => ({
  color: theme.danger
}));
const SubEntries = styled('div', {
  marginLeft: '.1em',
  paddingLeft: '1em',
  borderLeft: '2px solid rgba(0,0,0,.15)'
});
const Info = styled('span', {
  color: 'grey',
  fontSize: '.7em'
});
const Expander = ({
  expanded,
  style = {}
}) => /*#__PURE__*/React.createElement("span", {
  style: {
    display: 'inline-block',
    transition: 'all .1s ease',
    transform: "rotate(" + (expanded ? 90 : 0) + "deg) " + (style.transform || ''),
    ...style
  }
}, "\u25B6");

const Copier = () => /*#__PURE__*/React.createElement("span", {
  "aria-label": "Copy object to clipboard",
  title: "Copy object to clipboard",
  style: {
    paddingLeft: '1em'
  }
}, /*#__PURE__*/React.createElement("svg", {
  height: "12",
  viewBox: "0 0 16 12",
  width: "10"
}, /*#__PURE__*/React.createElement("path", {
  fill: "currentColor",
  d: "M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"
}), /*#__PURE__*/React.createElement("path", {
  fill: "currentColor",
  d: "M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"
})));

const ErrorCopier = () => /*#__PURE__*/React.createElement("span", {
  "aria-label": "Failed copying to clipboard",
  title: "Failed copying to clipboard",
  style: {
    paddingLeft: '1em',
    display: 'flex',
    alignItems: 'center'
  }
}, /*#__PURE__*/React.createElement("svg", {
  height: "12",
  viewBox: "0 0 16 12",
  width: "10",
  display: "block"
}, /*#__PURE__*/React.createElement("path", {
  fill: "red",
  d: "M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"
})), /*#__PURE__*/React.createElement("span", {
  style: {
    color: 'red',
    fontSize: '12px',
    paddingLeft: '4px',
    position: 'relative',
    top: '2px'
  }
}, "See console"));

const CopiedCopier = () => /*#__PURE__*/React.createElement("span", {
  "aria-label": "Object copied to clipboard",
  title: "Object copied to clipboard",
  style: {
    paddingLeft: '1em',
    display: 'inline-block',
    verticalAlign: 'middle'
  }
}, /*#__PURE__*/React.createElement("svg", {
  height: "16",
  viewBox: "0 0 16 16",
  width: "16",
  display: "block"
}, /*#__PURE__*/React.createElement("path", {
  fill: "green",
  d: "M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
})));

/**
 * Chunk elements in the array by size
 *
 * when the array cannot be chunked evenly by size, the last chunk will be
 * filled with the remaining elements
 *
 * @example
 * chunkArray(['a','b', 'c', 'd', 'e'], 2) // returns [['a','b'], ['c', 'd'], ['e']]
 */
function chunkArray(array, size) {
  if (size < 1) return [];
  let i = 0;
  const result = [];

  while (i < array.length) {
    result.push(array.slice(i, i + size));
    i = i + size;
  }

  return result;
}
const DefaultRenderer = ({
  handleEntry,
  label,
  value,
  subEntries = [],
  subEntryPages = [],
  type,
  expanded = false,
  copyable = false,
  toggleExpanded,
  pageSize
}) => {
  const [expandedPages, setExpandedPages] = React.useState([]);
  return /*#__PURE__*/React.createElement(Entry, {
    key: label
  }, subEntryPages.length ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ExpandButton, {
    onClick: () => toggleExpanded()
  }, /*#__PURE__*/React.createElement(Expander, {
    expanded: expanded
  }), " ", label, ' ', /*#__PURE__*/React.createElement(Info, null, String(type).toLowerCase() === 'iterable' ? '(Iterable) ' : '', subEntries.length, " ", subEntries.length > 1 ? "items" : "item")), copyable ? /*#__PURE__*/React.createElement(CopyButton, {
    value: value
  }) : null, expanded ? subEntryPages.length === 1 ? /*#__PURE__*/React.createElement(SubEntries, null, subEntries.map(handleEntry)) : /*#__PURE__*/React.createElement(SubEntries, null, subEntryPages.map((entries, index) => /*#__PURE__*/React.createElement("div", {
    key: index
  }, /*#__PURE__*/React.createElement(Entry, null, /*#__PURE__*/React.createElement(LabelButton, {
    onClick: () => setExpandedPages(old => old.includes(index) ? old.filter(d => d !== index) : [...old, index])
  }, /*#__PURE__*/React.createElement(Expander, {
    expanded: expanded
  }), " [", index * pageSize, " ...", ' ', index * pageSize + pageSize - 1, "]"), expandedPages.includes(index) ? /*#__PURE__*/React.createElement(SubEntries, null, entries.map(handleEntry)) : null)))) : null) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Label, null, label, ":"), " ", /*#__PURE__*/React.createElement(Value, null, displayValue(value))));
};

function isIterable(x) {
  return Symbol.iterator in x;
}

function Explorer({
  value,
  defaultExpanded,
  renderer = DefaultRenderer,
  pageSize = 100,
  copyable = false,
  ...rest
}) {
  const [expanded, setExpanded] = React.useState(Boolean(defaultExpanded));
  const toggleExpanded = React.useCallback(() => setExpanded(old => !old), []);
  let type = typeof value;
  let subEntries = [];

  const makeProperty = sub => {
    const subDefaultExpanded = defaultExpanded === true ? {
      [sub.label]: true
    } : defaultExpanded == null ? void 0 : defaultExpanded[sub.label];
    return { ...sub,
      defaultExpanded: subDefaultExpanded
    };
  };

  if (Array.isArray(value)) {
    type = 'array';
    subEntries = value.map((d, i) => makeProperty({
      label: i.toString(),
      value: d
    }));
  } else if (value !== null && typeof value === 'object' && isIterable(value) && typeof value[Symbol.iterator] === 'function') {
    type = 'Iterable';
    subEntries = Array.from(value, (val, i) => makeProperty({
      label: i.toString(),
      value: val
    }));
  } else if (typeof value === 'object' && value !== null) {
    type = 'object';
    subEntries = Object.entries(value).map(([key, val]) => makeProperty({
      label: key,
      value: val
    }));
  }

  const subEntryPages = chunkArray(subEntries, pageSize);
  return renderer({
    handleEntry: entry => /*#__PURE__*/React.createElement(Explorer, _extends({
      key: entry.label,
      value: value,
      renderer: renderer,
      copyable: copyable
    }, rest, entry)),
    type,
    subEntries,
    subEntryPages,
    value,
    expanded,
    copyable,
    toggleExpanded,
    pageSize,
    ...rest
  });
}

function Logo(props) {
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: "40px",
    height: "40px",
    viewBox: "0 0 190 190",
    version: "1.1"
  }, props), /*#__PURE__*/React.createElement("g", {
    stroke: "none",
    strokeWidth: "1",
    fill: "none",
    fillRule: "evenodd"
  }, /*#__PURE__*/React.createElement("g", {
    transform: "translate(-33.000000, 0.000000)"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M72.7239712,61.3436237 C69.631224,46.362877 68.9675112,34.8727722 70.9666331,26.5293551 C72.1555965,21.5671678 74.3293088,17.5190846 77.6346064,14.5984631 C81.1241394,11.5150478 85.5360327,10.0020122 90.493257,10.0020122 C98.6712013,10.0020122 107.26826,13.7273214 116.455725,20.8044264 C120.20312,23.6910458 124.092437,27.170411 128.131651,31.2444746 C128.45314,30.8310265 128.816542,30.4410453 129.22143,30.0806152 C140.64098,19.9149716 150.255245,13.5989272 158.478408,11.1636507 C163.367899,9.715636 167.958526,9.57768202 172.138936,10.983031 C176.551631,12.4664684 180.06766,15.5329489 182.548314,19.8281091 C186.642288,26.9166735 187.721918,36.2310983 186.195595,47.7320243 C185.573451,52.4199112 184.50985,57.5263831 183.007094,63.0593153 C183.574045,63.1277086 184.142416,63.2532808 184.705041,63.4395297 C199.193932,68.2358678 209.453582,73.3937462 215.665021,79.2882839 C219.360669,82.7953831 221.773972,86.6998434 222.646365,91.0218204 C223.567176,95.5836746 222.669313,100.159332 220.191548,104.451297 C216.105211,111.529614 208.591643,117.11221 197.887587,121.534031 C193.589552,123.309539 188.726579,124.917559 183.293259,126.363748 C183.541176,126.92292 183.733521,127.516759 183.862138,128.139758 C186.954886,143.120505 187.618598,154.61061 185.619477,162.954027 C184.430513,167.916214 182.256801,171.964297 178.951503,174.884919 C175.46197,177.968334 171.050077,179.48137 166.092853,179.48137 C157.914908,179.48137 149.31785,175.756061 140.130385,168.678956 C136.343104,165.761613 132.410866,162.238839 128.325434,158.108619 C127.905075,158.765474 127.388968,159.376011 126.77857,159.919385 C115.35902,170.085028 105.744755,176.401073 97.5215915,178.836349 C92.6321009,180.284364 88.0414736,180.422318 83.8610636,179.016969 C79.4483686,177.533532 75.9323404,174.467051 73.4516862,170.171891 C69.3577116,163.083327 68.2780823,153.768902 69.8044053,142.267976 C70.449038,137.410634 71.56762,132.103898 73.1575891,126.339009 C72.5361041,126.276104 71.9120754,126.144816 71.2949591,125.940529 C56.8060684,121.144191 46.5464184,115.986312 40.3349789,110.091775 C36.6393312,106.584675 34.2260275,102.680215 33.3536352,98.3582381 C32.4328237,93.7963839 33.3306866,89.2207269 35.8084524,84.9287618 C39.8947886,77.8504443 47.4083565,72.2678481 58.1124133,67.8460273 C62.5385143,66.0176154 67.5637208,64.366822 73.1939394,62.8874674 C72.9933393,62.3969171 72.8349374,61.8811235 72.7239712,61.3436237 Z",
    fill: "#002C4B",
    fillRule: "nonzero",
    transform: "translate(128.000000, 95.000000) scale(-1, 1) translate(-128.000000, -95.000000) "
  }), /*#__PURE__*/React.createElement("path", {
    d: "M113.396882,64 L142.608177,64 C144.399254,64 146.053521,64.958025 146.944933,66.5115174 L161.577138,92.0115174 C162.461464,93.5526583 162.461464,95.4473417 161.577138,96.9884826 L146.944933,122.488483 C146.053521,124.041975 144.399254,125 142.608177,125 L113.396882,125 C111.605806,125 109.951539,124.041975 109.060126,122.488483 L94.4279211,96.9884826 C93.543596,95.4473417 93.543596,93.5526583 94.4279211,92.0115174 L109.060126,66.5115174 C109.951539,64.958025 111.605806,64 113.396882,64 Z M138.987827,70.2765273 C140.779849,70.2765273 142.434839,71.2355558 143.325899,72.7903404 L154.343038,92.0138131 C155.225607,93.5537825 155.225607,95.4462175 154.343038,96.9861869 L143.325899,116.20966 C142.434839,117.764444 140.779849,118.723473 138.987827,118.723473 L117.017233,118.723473 C115.225211,118.723473 113.570221,117.764444 112.67916,116.20966 L101.662022,96.9861869 C100.779452,95.4462175 100.779452,93.5537825 101.662022,92.0138131 L112.67916,72.7903404 C113.570221,71.2355558 115.225211,70.2765273 117.017233,70.2765273 L138.987827,70.2765273 Z M135.080648,77.1414791 L120.924411,77.1414791 C119.134228,77.1414791 117.480644,78.0985567 116.5889,79.6508285 L116.5889,79.6508285 L109.489217,92.0093494 C108.603232,93.5515958 108.603232,95.4484042 109.489217,96.9906506 L109.489217,96.9906506 L116.5889,109.349172 C117.480644,110.901443 119.134228,111.858521 120.924411,111.858521 L120.924411,111.858521 L135.080648,111.858521 C136.870831,111.858521 138.524416,110.901443 139.41616,109.349172 L139.41616,109.349172 L146.515843,96.9906506 C147.401828,95.4484042 147.401828,93.5515958 146.515843,92.0093494 L146.515843,92.0093494 L139.41616,79.6508285 C138.524416,78.0985567 136.870831,77.1414791 135.080648,77.1414791 L135.080648,77.1414791 Z M131.319186,83.7122186 C133.108028,83.7122186 134.760587,84.6678753 135.652827,86.2183156 L138.983552,92.0060969 C139.87203,93.5500005 139.87203,95.4499995 138.983552,96.9939031 L135.652827,102.781684 C134.760587,104.332125 133.108028,105.287781 131.319186,105.287781 L124.685874,105.287781 C122.897032,105.287781 121.244473,104.332125 120.352233,102.781684 L117.021508,96.9939031 C116.13303,95.4499995 116.13303,93.5500005 117.021508,92.0060969 L120.352233,86.2183156 C121.244473,84.6678753 122.897032,83.7122186 124.685874,83.7122186 L131.319186,83.7122186 Z M128.003794,90.1848875 C126.459294,90.1848875 125.034382,91.0072828 124.263005,92.3424437 C123.491732,93.6774232 123.491732,95.3225768 124.263005,96.6575563 C125.034382,97.9927172 126.459294,98.8151125 128.001266,98.8151125 L128.001266,98.8151125 C129.545766,98.8151125 130.970678,97.9927172 131.742055,96.6575563 C132.513327,95.3225768 132.513327,93.6774232 131.742055,92.3424437 C130.970678,91.0072828 129.545766,90.1848875 128.003794,90.1848875 L128.003794,90.1848875 Z M93,94.5009646 L100.767764,94.5009646",
    fill: "#FFD94C"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M87.8601729,108.357758 C89.1715224,107.608286 90.8360246,108.074601 91.5779424,109.399303 L91.5779424,109.399303 L92.0525843,110.24352 C95.8563392,116.982993 99.8190116,123.380176 103.940602,129.435068 C108.807881,136.585427 114.28184,143.82411 120.362479,151.151115 C121.316878,152.30114 121.184944,154.011176 120.065686,154.997937 L120.065686,154.997937 L119.454208,155.534625 C99.3465389,173.103314 86.2778188,176.612552 80.2480482,166.062341 C74.3500652,155.742717 76.4844915,136.982888 86.6513274,109.782853 C86.876818,109.179582 87.3045861,108.675291 87.8601729,108.357758 Z M173.534177,129.041504 C174.986131,128.785177 176.375496,129.742138 176.65963,131.194242 L176.65963,131.194242 L176.812815,131.986376 C181.782365,157.995459 178.283348,171 166.315764,171 C154.609745,171 139.708724,159.909007 121.612702,137.727022 C121.211349,137.235047 120.994572,136.617371 121,135.981509 C121.013158,134.480686 122.235785,133.274651 123.730918,133.287756 L123.730918,133.287756 L124.684654,133.294531 C132.305698,133.335994 139.714387,133.071591 146.910723,132.501323 C155.409039,131.82788 164.283523,130.674607 173.534177,129.041504 Z M180.408726,73.8119663 C180.932139,72.4026903 182.508386,71.6634537 183.954581,72.149012 L183.954581,72.149012 L184.742552,72.4154854 C210.583763,81.217922 220.402356,90.8916805 214.198332,101.436761 C208.129904,111.751366 190.484347,119.260339 161.26166,123.963678 C160.613529,124.067994 159.948643,123.945969 159.382735,123.618843 C158.047025,122.846729 157.602046,121.158214 158.388848,119.847438 L158.388848,119.847438 L158.889328,119.0105 C162.877183,112.31633 166.481358,105.654262 169.701854,99.0242957 C173.50501,91.1948179 177.073967,82.7907081 180.408726,73.8119663 Z M94.7383398,66.0363218 C95.3864708,65.9320063 96.0513565,66.0540315 96.6172646,66.3811573 C97.9529754,67.153271 98.3979538,68.8417862 97.6111517,70.1525615 L97.6111517,70.1525615 L97.1106718,70.9895001 C93.1228168,77.6836699 89.5186416,84.3457379 86.2981462,90.9757043 C82.49499,98.8051821 78.9260328,107.209292 75.5912744,116.188034 C75.0678608,117.59731 73.4916142,118.336546 72.045419,117.850988 L72.045419,117.850988 L71.2574475,117.584515 C45.4162372,108.782078 35.597644,99.1083195 41.8016679,88.5632391 C47.8700957,78.2486335 65.515653,70.7396611 94.7383398,66.0363218 Z M136.545792,34.4653746 C156.653461,16.8966864 169.722181,13.3874478 175.751952,23.9376587 C181.649935,34.2572826 179.515508,53.0171122 169.348673,80.2171474 C169.123182,80.8204179 168.695414,81.324709 168.139827,81.6422422 C166.828478,82.3917144 165.163975,81.9253986 164.422058,80.6006966 L164.422058,80.6006966 L163.947416,79.7564798 C160.143661,73.0170065 156.180988,66.6198239 152.059398,60.564932 C147.192119,53.4145727 141.71816,46.1758903 135.637521,38.8488847 C134.683122,37.6988602 134.815056,35.9888243 135.934314,35.0020629 L135.934314,35.0020629 Z M90.6842361,18 C102.390255,18 117.291276,29.0909926 135.387298,51.2729777 C135.788651,51.7649527 136.005428,52.3826288 136,53.0184911 C135.986842,54.5193144 134.764215,55.7253489 133.269082,55.7122445 L133.269082,55.7122445 L132.315346,55.7054689 C124.694302,55.6640063 117.285613,55.9284091 110.089277,56.4986773 C101.590961,57.17212 92.7164767,58.325393 83.4658235,59.9584962 C82.0138691,60.2148231 80.6245044,59.2578618 80.3403697,57.805758 L80.3403697,57.805758 L80.1871846,57.0136235 C75.2176347,31.0045412 78.7166519,18 90.6842361,18 Z",
    fill: "#FF4154"
  }))));
}

function ReactQueryDevtools$1({
  initialIsOpen,
  panelProps = {},
  closeButtonProps = {},
  toggleButtonProps = {},
  position = 'bottom-left',
  containerElement: Container = 'aside',
  context,
  styleNonce,
  panelPosition: initialPanelPosition = 'bottom',
  errorTypes = []
}) {
  const rootRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const [isOpen, setIsOpen] = useLocalStorage('reactQueryDevtoolsOpen', initialIsOpen);
  const [devtoolsHeight, setDevtoolsHeight] = useLocalStorage('reactQueryDevtoolsHeight', defaultPanelSize);
  const [devtoolsWidth, setDevtoolsWidth] = useLocalStorage('reactQueryDevtoolsWidth', defaultPanelSize);
  const [panelPosition = 'bottom', setPanelPosition] = useLocalStorage('reactQueryDevtoolsPanelPosition', initialPanelPosition);
  const [isResolvedOpen, setIsResolvedOpen] = React.useState(false);
  const [isResizing, setIsResizing] = React.useState(false);
  const isMounted = useIsMounted();

  const handleDragStart = (panelElement, startEvent) => {
    if (!panelElement) return;
    if (startEvent.button !== 0) return; // Only allow left click for drag

    const isVertical = isVerticalSide(panelPosition);
    setIsResizing(true);
    const {
      height,
      width
    } = panelElement.getBoundingClientRect();
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    let newSize = 0;

    const run = moveEvent => {
      // prevent mouse selecting stuff with mouse drag
      moveEvent.preventDefault(); // calculate the correct size based on mouse position and current panel position
      // hint: it is different formula for the opposite sides

      if (isVertical) {
        newSize = width + (panelPosition === 'right' ? startX - moveEvent.clientX : moveEvent.clientX - startX);
        setDevtoolsWidth(newSize);
      } else {
        newSize = height + (panelPosition === 'bottom' ? startY - moveEvent.clientY : moveEvent.clientY - startY);
        setDevtoolsHeight(newSize);
      }

      if (newSize < minPanelSize) {
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    };

    const unsub = () => {
      if (isResizing) {
        setIsResizing(false);
      }

      document.removeEventListener('mousemove', run, false);
      document.removeEventListener('mouseUp', unsub, false);
    };

    document.addEventListener('mousemove', run, false);
    document.addEventListener('mouseup', unsub, false);
  };

  React.useEffect(() => {
    setIsResolvedOpen(isOpen != null ? isOpen : false);
  }, [isOpen, isResolvedOpen, setIsResolvedOpen]); // Toggle panel visibility before/after transition (depending on direction).
  // Prevents focusing in a closed panel.

  React.useEffect(() => {
    const ref = panelRef.current;

    if (ref) {
      const handlePanelTransitionStart = () => {
        if (isResolvedOpen) {
          ref.style.visibility = 'visible';
        }
      };

      const handlePanelTransitionEnd = () => {
        if (!isResolvedOpen) {
          ref.style.visibility = 'hidden';
        }
      };

      ref.addEventListener('transitionstart', handlePanelTransitionStart);
      ref.addEventListener('transitionend', handlePanelTransitionEnd);
      return () => {
        ref.removeEventListener('transitionstart', handlePanelTransitionStart);
        ref.removeEventListener('transitionend', handlePanelTransitionEnd);
      };
    }

    return;
  }, [isResolvedOpen]);
  React.useEffect(() => {
    var _rootRef$current;

    if (isResolvedOpen && (_rootRef$current = rootRef.current) != null && _rootRef$current.parentElement) {
      const {
        parentElement
      } = rootRef.current;
      const styleProp = getSidedProp('padding', panelPosition);
      const isVertical = isVerticalSide(panelPosition);

      const previousPaddings = (({
        padding,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight
      }) => ({
        padding,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight
      }))(parentElement.style);

      const run = () => {
        // reset the padding
        parentElement.style.padding = '0px';
        parentElement.style.paddingTop = '0px';
        parentElement.style.paddingBottom = '0px';
        parentElement.style.paddingLeft = '0px';
        parentElement.style.paddingRight = '0px'; // set the new padding based on the new panel position

        parentElement.style[styleProp] = (isVertical ? devtoolsWidth : devtoolsHeight) + "px";
      };

      run();

      if (typeof window !== 'undefined') {
        window.addEventListener('resize', run);
        return () => {
          window.removeEventListener('resize', run);
          Object.entries(previousPaddings).forEach(([property, previousValue]) => {
            parentElement.style[property] = previousValue;
          });
        };
      }
    }

    return;
  }, [isResolvedOpen, panelPosition, devtoolsHeight, devtoolsWidth]);
  const {
    style: panelStyle = {},
    ...otherPanelProps
  } = panelProps;
  const {
    style: toggleButtonStyle = {},
    onClick: onToggleClick,
    ...otherToggleButtonProps
  } = toggleButtonProps; // get computed style based on panel position

  const style = getSidePanelStyle({
    position: panelPosition,
    devtoolsTheme: defaultTheme,
    isOpen: isResolvedOpen,
    height: devtoolsHeight,
    width: devtoolsWidth,
    isResizing,
    panelStyle
  }); // Do not render on the server

  if (!isMounted()) return null;
  return /*#__PURE__*/React.createElement(Container, {
    ref: rootRef,
    className: "ReactQueryDevtools",
    "aria-label": "React Query Devtools"
  }, /*#__PURE__*/React.createElement(ThemeProvider, {
    theme: defaultTheme
  }, /*#__PURE__*/React.createElement(ReactQueryDevtoolsPanel$1, _extends({
    ref: panelRef,
    context: context,
    styleNonce: styleNonce,
    position: panelPosition,
    onPositionChange: setPanelPosition,
    showCloseButton: true,
    closeButtonProps: closeButtonProps
  }, otherPanelProps, {
    style: style,
    isOpen: isResolvedOpen,
    setIsOpen: setIsOpen,
    onDragStart: e => handleDragStart(panelRef.current, e),
    errorTypes: errorTypes
  }))), !isResolvedOpen ? /*#__PURE__*/React.createElement("button", _extends({
    type: "button"
  }, otherToggleButtonProps, {
    "aria-label": "Open React Query Devtools",
    "aria-controls": "ReactQueryDevtoolsPanel",
    "aria-haspopup": "true",
    "aria-expanded": "false",
    onClick: e => {
      setIsOpen(true);
      onToggleClick == null ? void 0 : onToggleClick(e);
    },
    style: {
      background: 'none',
      border: 0,
      padding: 0,
      position: 'fixed',
      zIndex: 99999,
      display: 'inline-flex',
      fontSize: '1.5em',
      margin: '.5em',
      cursor: 'pointer',
      width: 'fit-content',
      ...(position === 'top-right' ? {
        top: '0',
        right: '0'
      } : position === 'top-left' ? {
        top: '0',
        left: '0'
      } : position === 'bottom-right' ? {
        bottom: '0',
        right: '0'
      } : {
        bottom: '0',
        left: '0'
      }),
      ...toggleButtonStyle
    }
  }), /*#__PURE__*/React.createElement(Logo, {
    "aria-hidden": true
  }), /*#__PURE__*/React.createElement(ScreenReader, {
    text: "Open React Query Devtools"
  })) : null);
}

const useSubscribeToQueryCache = (queryCache, getSnapshot, skip = false) => {
  return useSyncExternalStore(React.useCallback(onStoreChange => {
    if (!skip) return queryCache.subscribe(notifyManager.batchCalls(onStoreChange));
    return () => {
      return;
    };
  }, [queryCache, skip]), getSnapshot, getSnapshot);
};

const ReactQueryDevtoolsPanel$1 = /*#__PURE__*/React.forwardRef(function ReactQueryDevtoolsPanel(props, ref) {
  const {
    isOpen = true,
    styleNonce,
    setIsOpen,
    context,
    onDragStart,
    onPositionChange,
    showCloseButton,
    position,
    closeButtonProps = {},
    errorTypes = [],
    ...panelProps
  } = props;
  const {
    onClick: onCloseClick,
    ...otherCloseButtonProps
  } = closeButtonProps;
  const queryClient = useQueryClient({
    context
  });
  const queryCache = queryClient.getQueryCache();
  const [sort, setSort] = useLocalStorage('reactQueryDevtoolsSortFn', Object.keys(sortFns)[0]);
  const [filter, setFilter] = useLocalStorage('reactQueryDevtoolsFilter', '');
  const [baseSort, setBaseSort] = useLocalStorage('reactQueryDevtoolsBaseSort', 1);
  const sortFn = React.useMemo(() => sortFns[sort], [sort]);
  const queriesCount = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().length, !isOpen);
  const [activeQueryHash, setActiveQueryHash] = useLocalStorage('reactQueryDevtoolsActiveQueryHash', '');
  const queries = React.useMemo(() => {
    const unsortedQueries = queryCache.getAll();

    if (queriesCount === 0) {
      return [];
    }

    const filtered = filter ? unsortedQueries.filter(item => rankItem(item.queryHash, filter).passed) : [...unsortedQueries];
    const sorted = sortFn ? filtered.sort((a, b) => sortFn(a, b) * baseSort) : filtered;
    return sorted;
  }, [baseSort, sortFn, filter, queriesCount, queryCache]);
  const [isMockOffline, setMockOffline] = React.useState(false);
  return /*#__PURE__*/React.createElement(ThemeProvider, {
    theme: defaultTheme
  }, /*#__PURE__*/React.createElement(Panel, _extends({
    ref: ref,
    className: "ReactQueryDevtoolsPanel",
    "aria-label": "React Query Devtools Panel",
    id: "ReactQueryDevtoolsPanel"
  }, panelProps, {
    style: {
      height: defaultPanelSize,
      position: 'relative',
      ...panelProps.style
    }
  }), /*#__PURE__*/React.createElement("style", {
    nonce: styleNonce,
    dangerouslySetInnerHTML: {
      __html: "\n            .ReactQueryDevtoolsPanel * {\n              scrollbar-color: " + defaultTheme.backgroundAlt + " " + defaultTheme.gray + ";\n            }\n\n            .ReactQueryDevtoolsPanel *::-webkit-scrollbar, .ReactQueryDevtoolsPanel scrollbar {\n              width: 1em;\n              height: 1em;\n            }\n\n            .ReactQueryDevtoolsPanel *::-webkit-scrollbar-track, .ReactQueryDevtoolsPanel scrollbar-track {\n              background: " + defaultTheme.backgroundAlt + ";\n            }\n\n            .ReactQueryDevtoolsPanel *::-webkit-scrollbar-thumb, .ReactQueryDevtoolsPanel scrollbar-thumb {\n              background: " + defaultTheme.gray + ";\n              border-radius: .5em;\n              border: 3px solid " + defaultTheme.backgroundAlt + ";\n            }\n          "
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: getResizeHandleStyle(position),
    onMouseDown: onDragStart
  }), isOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '1 1 500px',
      minHeight: '40%',
      maxHeight: '100%',
      overflow: 'auto',
      borderRight: "1px solid " + defaultTheme.grayAlt,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '.5em',
      background: defaultTheme.backgroundAlt,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Close React Query Devtools",
    "aria-controls": "ReactQueryDevtoolsPanel",
    "aria-haspopup": "true",
    "aria-expanded": "true",
    onClick: () => setIsOpen(false),
    style: {
      display: 'inline-flex',
      background: 'none',
      border: 0,
      padding: 0,
      marginRight: '.5em',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    "aria-hidden": true
  }), /*#__PURE__*/React.createElement(ScreenReader, {
    text: "Close React Query Devtools"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '.5em'
    }
  }, /*#__PURE__*/React.createElement(QueryStatusCount, {
    queryCache: queryCache
  }), position && onPositionChange ? /*#__PURE__*/React.createElement(Select, {
    "aria-label": "Panel position",
    value: position,
    style: {
      marginInlineStart: '.5em'
    },
    onChange: e => onPositionChange(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "left"
  }, "Left"), /*#__PURE__*/React.createElement("option", {
    value: "right"
  }, "Right"), /*#__PURE__*/React.createElement("option", {
    value: "top"
  }, "Top"), /*#__PURE__*/React.createElement("option", {
    value: "bottom"
  }, "Bottom")) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '0.5em'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Filter",
    "aria-label": "Filter by queryhash",
    value: filter != null ? filter : '',
    onChange: e => setFilter(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Escape') setFilter('');
    },
    style: {
      flex: '1',
      width: '100%'
    }
  }), /*#__PURE__*/React.createElement(Select, {
    "aria-label": "Sort queries",
    value: sort,
    onChange: e => setSort(e.target.value),
    style: {
      flex: '1',
      minWidth: 75,
      marginRight: '.5em'
    }
  }, Object.keys(sortFns).map(key => /*#__PURE__*/React.createElement("option", {
    key: key,
    value: key
  }, "Sort by ", key))), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    onClick: () => setBaseSort(old => old * -1),
    style: {
      padding: '.3em .4em',
      marginRight: '.5em'
    }
  }, baseSort === 1 ? '⬆ Asc' : '⬇ Desc'), /*#__PURE__*/React.createElement(Button, {
    title: "Clear cache",
    "aria-label": "Clear cache",
    type: "button",
    onClick: () => queryCache.clear(),
    style: {
      padding: '.3em .4em',
      marginRight: '.5em'
    }
  }, "Clear"), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    onClick: () => {
      if (isMockOffline) {
        onlineManager.setOnline(undefined);
        setMockOffline(false);
        window.dispatchEvent(new Event('online'));
      } else {
        onlineManager.setOnline(false);
        setMockOffline(true);
      }
    },
    "aria-label": isMockOffline ? 'Restore offline mock' : 'Mock offline behavior',
    title: isMockOffline ? 'Restore offline mock' : 'Mock offline behavior',
    style: {
      padding: '0',
      height: '2em'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "2em",
    height: "2em",
    viewBox: "0 0 24 24",
    stroke: isMockOffline ? defaultTheme.danger : 'currentColor',
    fill: "none"
  }, isMockOffline ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    stroke: "none",
    d: "M0 0h24v24H0z",
    fill: "none"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "18",
    x2: "12.01",
    y2: "18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.172 15.172a4 4 0 0 1 5.656 0"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.101 -.92a12 12 0 0 1 10.325 3.374"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "3",
    y1: "3",
    x2: "21",
    y2: "21"
  })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    stroke: "none",
    d: "M0 0h24v24H0z",
    fill: "none"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "18",
    x2: "12.01",
    y2: "18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.172 15.172a4 4 0 0 1 5.656 0"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.343 12.343a8 8 0 0 1 11.314 0"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.515 9.515c4.686 -4.687 12.284 -4.687 17 0"
  }))), /*#__PURE__*/React.createElement(ScreenReader, {
    text: isMockOffline ? 'Restore offline mock' : 'Mock offline behavior'
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: 'auto',
      flex: '1'
    }
  }, queries.map(query => {
    return /*#__PURE__*/React.createElement(QueryRow, {
      queryKey: query.queryKey,
      activeQueryHash: activeQueryHash,
      setActiveQueryHash: setActiveQueryHash,
      key: query.queryHash,
      queryCache: queryCache
    });
  }))), activeQueryHash && isOpen ? /*#__PURE__*/React.createElement(ActiveQuery, {
    activeQueryHash: activeQueryHash,
    queryCache: queryCache,
    queryClient: queryClient,
    errorTypes: errorTypes
  }) : null, showCloseButton ? /*#__PURE__*/React.createElement(Button, _extends({
    type: "button",
    "aria-controls": "ReactQueryDevtoolsPanel",
    "aria-haspopup": "true",
    "aria-expanded": "true"
  }, otherCloseButtonProps, {
    style: {
      position: 'absolute',
      zIndex: 99999,
      margin: '.5em',
      bottom: 0,
      left: 0,
      ...otherCloseButtonProps.style
    },
    onClick: e => {
      setIsOpen(false);
      onCloseClick == null ? void 0 : onCloseClick(e);
    }
  }), "Close") : null));
});

const ActiveQuery = ({
  queryCache,
  activeQueryHash,
  queryClient,
  errorTypes
}) => {
  var _useSubscribeToQueryC, _useSubscribeToQueryC2;

  const activeQuery = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().find(query => query.queryHash === activeQueryHash));
  const activeQueryState = useSubscribeToQueryCache(queryCache, () => {
    var _queryCache$getAll$fi;

    return (_queryCache$getAll$fi = queryCache.getAll().find(query => query.queryHash === activeQueryHash)) == null ? void 0 : _queryCache$getAll$fi.state;
  });
  const isStale = (_useSubscribeToQueryC = useSubscribeToQueryCache(queryCache, () => {
    var _queryCache$getAll$fi2;

    return (_queryCache$getAll$fi2 = queryCache.getAll().find(query => query.queryHash === activeQueryHash)) == null ? void 0 : _queryCache$getAll$fi2.isStale();
  })) != null ? _useSubscribeToQueryC : false;
  const observerCount = (_useSubscribeToQueryC2 = useSubscribeToQueryCache(queryCache, () => {
    var _queryCache$getAll$fi3;

    return (_queryCache$getAll$fi3 = queryCache.getAll().find(query => query.queryHash === activeQueryHash)) == null ? void 0 : _queryCache$getAll$fi3.getObserversCount();
  })) != null ? _useSubscribeToQueryC2 : 0;

  const handleRefetch = () => {
    const promise = activeQuery == null ? void 0 : activeQuery.fetch();
    promise == null ? void 0 : promise.catch(noop);
  };

  const currentErrorTypeName = useMemo(() => {
    if (activeQuery && activeQueryState != null && activeQueryState.error) {
      const errorType = errorTypes.find(type => {
        var _activeQueryState$err;

        return type.initializer(activeQuery).toString() === ((_activeQueryState$err = activeQueryState.error) == null ? void 0 : _activeQueryState$err.toString());
      });
      return errorType == null ? void 0 : errorType.name;
    }

    return undefined;
  }, [activeQuery, activeQueryState == null ? void 0 : activeQueryState.error, errorTypes]);

  if (!activeQuery || !activeQueryState) {
    return null;
  }

  const triggerError = errorType => {
    var _errorType$initialize;

    const error = (_errorType$initialize = errorType == null ? void 0 : errorType.initializer(activeQuery)) != null ? _errorType$initialize : new Error('Unknown error from devtools');
    const __previousQueryOptions = activeQuery.options;
    activeQuery.setState({
      status: 'error',
      error,
      fetchMeta: { ...activeQuery.state.fetchMeta,
        __previousQueryOptions
      }
    });
  };

  const restoreQueryAfterLoadingOrError = () => {
    activeQuery.fetch(activeQuery.state.fetchMeta.__previousQueryOptions, {
      // Make sure this fetch will cancel the previous one
      cancelRefetch: true
    });
  };

  return /*#__PURE__*/React.createElement(ActiveQueryPanel, null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '.5em',
      background: defaultTheme.backgroundAlt,
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Query Details"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '.5em'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '.5em',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement(Code, {
    style: {
      lineHeight: '1.8em'
    }
  }, /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: 0,
      padding: 0,
      overflow: 'auto'
    }
  }, displayValue(activeQuery.queryKey, true))), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '0.3em .6em',
      borderRadius: '0.4em',
      fontWeight: 'bold',
      textShadow: '0 2px 10px black',
      background: getQueryStatusColor({
        queryState: activeQueryState,
        isStale: isStale,
        observerCount: observerCount,
        theme: defaultTheme
      }),
      flexShrink: 0
    }
  }, getQueryStatusLabel(activeQuery))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '.5em',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, "Observers: ", /*#__PURE__*/React.createElement(Code, null, observerCount)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, "Last Updated:", ' ', /*#__PURE__*/React.createElement(Code, null, new Date(activeQueryState.dataUpdatedAt).toLocaleTimeString()))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: defaultTheme.backgroundAlt,
      padding: '.5em',
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Actions"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0.5em',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.5em',
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    type: "button",
    onClick: handleRefetch,
    disabled: activeQueryState.fetchStatus === 'fetching',
    style: {
      background: defaultTheme.active
    }
  }, "Refetch"), ' ', /*#__PURE__*/React.createElement(Button, {
    type: "button",
    onClick: () => queryClient.invalidateQueries(activeQuery),
    style: {
      background: defaultTheme.warning,
      color: defaultTheme.inputTextColor
    }
  }, "Invalidate"), ' ', /*#__PURE__*/React.createElement(Button, {
    type: "button",
    onClick: () => queryClient.resetQueries(activeQuery),
    style: {
      background: defaultTheme.gray
    }
  }, "Reset"), ' ', /*#__PURE__*/React.createElement(Button, {
    type: "button",
    onClick: () => queryClient.removeQueries(activeQuery),
    style: {
      background: defaultTheme.danger
    }
  }, "Remove"), ' ', /*#__PURE__*/React.createElement(Button, {
    type: "button",
    onClick: () => {
      var _activeQuery$state$fe;

      // Return early if the query is already restoring
      if (activeQuery.state.fetchStatus === 'fetching' && typeof ((_activeQuery$state$fe = activeQuery.state.fetchMeta) == null ? void 0 : _activeQuery$state$fe.__previousQueryOptions) === 'undefined') {
        return;
      }

      if (activeQuery.state.data === undefined) {
        restoreQueryAfterLoadingOrError();
      } else {
        const __previousQueryOptions = activeQuery.options; // Trigger a fetch in order to trigger suspense as well.

        activeQuery.fetch({ ...__previousQueryOptions,
          queryFn: () => {
            return new Promise(() => {// Never resolve
            });
          },
          cacheTime: -1
        });
        activeQuery.setState({
          data: undefined,
          status: 'loading',
          fetchMeta: { ...activeQuery.state.fetchMeta,
            __previousQueryOptions
          }
        });
      }
    },
    style: {
      background: defaultTheme.paused
    }
  }, activeQuery.state.status === 'loading' ? 'Restore' : 'Trigger', ' ', "loading"), ' ', errorTypes.length === 0 || activeQuery.state.status === 'error' ? /*#__PURE__*/React.createElement(Button, {
    type: "button",
    onClick: () => {
      if (!activeQuery.state.error) {
        triggerError();
      } else {
        queryClient.resetQueries(activeQuery);
      }
    },
    style: {
      background: defaultTheme.danger
    }
  }, activeQuery.state.status === 'error' ? 'Restore' : 'Trigger', " error") : /*#__PURE__*/React.createElement("label", null, "Trigger error:", /*#__PURE__*/React.createElement(Select, {
    value: currentErrorTypeName != null ? currentErrorTypeName : '',
    style: {
      marginInlineStart: '.5em'
    },
    onChange: e => {
      const errorType = errorTypes.find(t => t.name === e.target.value);
      triggerError(errorType);
    }
  }, /*#__PURE__*/React.createElement("option", {
    key: "",
    value: ""
  }), errorTypes.map(errorType => /*#__PURE__*/React.createElement("option", {
    key: errorType.name,
    value: errorType.name
  }, errorType.name))))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: defaultTheme.backgroundAlt,
      padding: '.5em',
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Data Explorer"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '.5em'
    }
  }, /*#__PURE__*/React.createElement(Explorer, {
    label: "Data",
    value: activeQueryState.data,
    defaultExpanded: {},
    copyable: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: defaultTheme.backgroundAlt,
      padding: '.5em',
      position: 'sticky',
      top: 0,
      zIndex: 1
    }
  }, "Query Explorer"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '.5em'
    }
  }, /*#__PURE__*/React.createElement(Explorer, {
    label: "Query",
    value: activeQuery,
    defaultExpanded: {
      queryKey: true
    }
  })));
};

const QueryStatusCount = ({
  queryCache
}) => {
  const hasFresh = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'fresh').length);
  const hasFetching = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'fetching').length);
  const hasPaused = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'paused').length);
  const hasStale = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'stale').length);
  const hasInactive = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'inactive').length);
  return /*#__PURE__*/React.createElement(QueryKeys, null, /*#__PURE__*/React.createElement(QueryKey, {
    style: {
      background: defaultTheme.success,
      opacity: hasFresh ? 1 : 0.3
    }
  }, "fresh ", /*#__PURE__*/React.createElement(Code, null, "(", hasFresh, ")")), ' ', /*#__PURE__*/React.createElement(QueryKey, {
    style: {
      background: defaultTheme.active,
      opacity: hasFetching ? 1 : 0.3
    }
  }, "fetching ", /*#__PURE__*/React.createElement(Code, null, "(", hasFetching, ")")), ' ', /*#__PURE__*/React.createElement(QueryKey, {
    style: {
      background: defaultTheme.paused,
      opacity: hasPaused ? 1 : 0.3
    }
  }, "paused ", /*#__PURE__*/React.createElement(Code, null, "(", hasPaused, ")")), ' ', /*#__PURE__*/React.createElement(QueryKey, {
    style: {
      background: defaultTheme.warning,
      color: 'black',
      textShadow: '0',
      opacity: hasStale ? 1 : 0.3
    }
  }, "stale ", /*#__PURE__*/React.createElement(Code, null, "(", hasStale, ")")), ' ', /*#__PURE__*/React.createElement(QueryKey, {
    style: {
      background: defaultTheme.gray,
      opacity: hasInactive ? 1 : 0.3
    }
  }, "inactive ", /*#__PURE__*/React.createElement(Code, null, "(", hasInactive, ")")));
};

const QueryRow = /*#__PURE__*/React.memo(({
  queryKey,
  setActiveQueryHash,
  activeQueryHash,
  queryCache
}) => {
  var _useSubscribeToQueryC3, _useSubscribeToQueryC4, _useSubscribeToQueryC5, _useSubscribeToQueryC6;

  const queryHash = (_useSubscribeToQueryC3 = useSubscribeToQueryCache(queryCache, () => {
    var _queryCache$find;

    return (_queryCache$find = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find.queryHash;
  })) != null ? _useSubscribeToQueryC3 : '';
  const queryState = useSubscribeToQueryCache(queryCache, () => {
    var _queryCache$find2;

    return (_queryCache$find2 = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find2.state;
  });
  const isStale = (_useSubscribeToQueryC4 = useSubscribeToQueryCache(queryCache, () => {
    var _queryCache$find3;

    return (_queryCache$find3 = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find3.isStale();
  })) != null ? _useSubscribeToQueryC4 : false;
  const isDisabled = (_useSubscribeToQueryC5 = useSubscribeToQueryCache(queryCache, () => {
    var _queryCache$find4;

    return (_queryCache$find4 = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find4.isDisabled();
  })) != null ? _useSubscribeToQueryC5 : false;
  const observerCount = (_useSubscribeToQueryC6 = useSubscribeToQueryCache(queryCache, () => {
    var _queryCache$find5;

    return (_queryCache$find5 = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find5.getObserversCount();
  })) != null ? _useSubscribeToQueryC6 : 0;

  if (!queryState) {
    return null;
  }

  return /*#__PURE__*/React.createElement("div", {
    role: "button",
    "aria-label": "Open query details for " + queryHash,
    onClick: () => setActiveQueryHash(activeQueryHash === queryHash ? '' : queryHash),
    style: {
      display: 'flex',
      borderBottom: "solid 1px " + defaultTheme.grayAlt,
      cursor: 'pointer',
      background: queryHash === activeQueryHash ? 'rgba(255,255,255,.1)' : undefined
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 auto',
      width: '2em',
      height: '2em',
      background: getQueryStatusColor({
        queryState,
        isStale,
        observerCount,
        theme: defaultTheme
      }),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      textShadow: isStale ? '0' : '0 0 10px black',
      color: isStale ? 'black' : 'white'
    }
  }, observerCount), isDisabled ? /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 auto',
      height: '2em',
      background: defaultTheme.gray,
      display: 'flex',
      alignItems: 'center',
      fontWeight: 'bold',
      padding: '0 0.5em'
    }
  }, "disabled") : null, /*#__PURE__*/React.createElement(Code, {
    style: {
      padding: '.5em'
    }
  }, "" + queryHash));
});
QueryRow.displayName = 'QueryRow'; // eslint-disable-next-line @typescript-eslint/no-empty-function

function noop() {}

const ReactQueryDevtools = ReactQueryDevtools$1;
const ReactQueryDevtoolsPanel = ReactQueryDevtoolsPanel$1;

export { ReactQueryDevtools, ReactQueryDevtoolsPanel };
//# sourceMappingURL=index.prod.mjs.map
