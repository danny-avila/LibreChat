import React, { createContext, useRef, useContext, useCallback } from 'react';
import { useScreenshot as useScreenshot_ } from 'use-react-screenshot';

const ScreenshotContext = createContext({});

export const useScreenshot = () => {
  const { ref } = useContext(ScreenshotContext);
  const [image, takeScreenshot] = useScreenshot_();

  const captureScreenshot = () => {
    return takeScreenshot(ref.current);
  };

  return { screenshotTargetRef: ref, captureScreenshot };
};

export const ScreenshotProvider = ({ children }) => {
  const ref = useRef(null);

  return <ScreenshotContext.Provider value={{ ref }}>{children}</ScreenshotContext.Provider>;
};
