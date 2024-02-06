import * as React from 'react';
export default function useMemo(getValue, condition, shouldUpdate) {
  var cacheRef = React.useRef({});
  if (!('value' in cacheRef.current) || shouldUpdate(cacheRef.current.condition, condition)) {
    cacheRef.current.value = getValue();
    cacheRef.current.condition = condition;
  }
  return cacheRef.current.value;
}