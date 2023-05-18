import React, { createContext, useRef, useContext, useCallback } from 'react';
import html2canvas from 'html2canvas';

const ScreenshotContext = createContext({});

export const useScreenshot = () => {
  const { ref } = useContext(ScreenshotContext);

  const takeScreenShot = (node) => {
    if (!node) {
      throw new Error('You should provide correct html node.');
    }
    return html2canvas(node).then((canvas) => {
      const croppedCanvas = document.createElement('canvas');
      const croppedCanvasContext = croppedCanvas.getContext('2d');
      // init data
      const cropPositionTop = 0;
      const cropPositionLeft = 0;
      const cropWidth = canvas.width;
      const cropHeight = canvas.height;

      croppedCanvas.width = cropWidth;
      croppedCanvas.height = cropHeight;

      croppedCanvasContext.drawImage(canvas, cropPositionLeft, cropPositionTop);

      const base64Image = croppedCanvas.toDataURL('image/png', 1);

      return base64Image;
    });
  };

  const captureScreenshot = () => {
    return takeScreenShot(ref.current);
  };

  return { screenshotTargetRef: ref, captureScreenshot };
};

export const ScreenshotProvider = ({ children }) => {
  const ref = useRef(null);

  return <ScreenshotContext.Provider value={{ ref }}>{children}</ScreenshotContext.Provider>;
};
