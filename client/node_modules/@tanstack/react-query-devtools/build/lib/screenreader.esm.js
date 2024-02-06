import * as React from 'react';

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

export { ScreenReader as default };
//# sourceMappingURL=screenreader.esm.js.map
