import { createContext, useRef, useContext, RefObject } from 'react';
import { toCanvas } from 'html-to-image';
import { ThemeContext } from '~/hooks/ThemeContext';

type ScreenshotContextType = {
  ref?: RefObject<HTMLDivElement>;
};

const ScreenshotContext = createContext<ScreenshotContextType>({});

export const useScreenshot = () => {
  const { ref } = useContext(ScreenshotContext);
  const { theme } = useContext(ThemeContext);

  const takeScreenShot = async (node: HTMLElement) => {
    if (!node) {
      throw new Error('You should provide correct html node.');
    }

    let isDark = theme === 'dark';
    if (theme === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    const backgroundColor = isDark ? '#171717' : 'white';
    const canvas = await toCanvas(node);
    const croppedCanvas = document.createElement('canvas');
    const croppedCanvasContext = croppedCanvas.getContext('2d') as CanvasRenderingContext2D;
    // init data
    const cropPositionTop = 0;
    const cropPositionLeft = 0;
    const cropWidth = canvas.width;
    const cropHeight = canvas.height;

    croppedCanvas.width = cropWidth;
    croppedCanvas.height = cropHeight;

    croppedCanvasContext.fillStyle = backgroundColor;
    croppedCanvasContext?.fillRect(0, 0, cropWidth, cropHeight);

    croppedCanvasContext?.drawImage(canvas, cropPositionLeft, cropPositionTop);

    const base64Image = croppedCanvas.toDataURL('image/png', 1);

    return base64Image;
  };

  const captureScreenshot = async () => {
    if (ref instanceof Function) {
      throw new Error('Ref callback is not supported.');
    }
    if (ref?.current) {
      return takeScreenShot(ref.current);
    }
    throw new Error('Ref is not attached to any element.');
  };

  return { screenshotTargetRef: ref, captureScreenshot };
};

export const ScreenshotProvider = ({ children }) => {
  const ref = useRef(null);

  return <ScreenshotContext.Provider value={{ ref }}>{children}</ScreenshotContext.Provider>;
};
