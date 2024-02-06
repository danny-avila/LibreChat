'use client';
import { extends as _extends } from './_virtual/_rollupPluginBabelHelpers.mjs';
import * as React from 'react';
import { useMemo } from 'react';
import { useQueryClient, onlineManager, notifyManager } from '@tanstack/react-query';
import { rankItem } from '@tanstack/match-sorter-utils';
import useLocalStorage from './useLocalStorage.mjs';
import { defaultPanelSize, useIsMounted, getSidedProp, getSidePanelStyle, sortFns, getResizeHandleStyle, displayValue, getQueryStatusColor, getQueryStatusLabel, isVerticalSide, minPanelSize } from './utils.mjs';
import { Panel, Select, Input, Button, ActiveQueryPanel, Code, QueryKeys, QueryKey } from './styledComponents.mjs';
import ScreenReader from './screenreader.mjs';
import { defaultTheme, ThemeProvider } from './theme.mjs';
import Explorer from './Explorer.mjs';
import Logo from './Logo.mjs';
import { useSyncExternalStore } from 'use-sync-external-store/shim/index.js';

function ReactQueryDevtools({
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
  }, /*#__PURE__*/React.createElement(ReactQueryDevtoolsPanel, _extends({
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

const ReactQueryDevtoolsPanel = /*#__PURE__*/React.forwardRef(function ReactQueryDevtoolsPanel(props, ref) {
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

export { ReactQueryDevtools, ReactQueryDevtoolsPanel };
//# sourceMappingURL=devtools.mjs.map
