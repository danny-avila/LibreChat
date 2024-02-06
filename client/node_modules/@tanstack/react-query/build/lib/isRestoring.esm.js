'use client';
import * as React from 'react';

const IsRestoringContext = /*#__PURE__*/React.createContext(false);
const useIsRestoring = () => React.useContext(IsRestoringContext);
const IsRestoringProvider = IsRestoringContext.Provider;

export { IsRestoringProvider, useIsRestoring };
//# sourceMappingURL=isRestoring.esm.js.map
