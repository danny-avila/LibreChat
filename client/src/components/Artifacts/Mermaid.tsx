import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import { Button } from '@librechat/client';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { artifactFlowchartConfig } from '~/utils/mermaid';

interface MermaidDiagramProps {
  content: string;
  isDarkMode?: boolean;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ content, isDarkMode = true }) => {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [isRendered, setIsRendered] = useState(false);
  const theme = isDarkMode ? 'dark' : 'neutral';
  const bgColor = isDarkMode ? '#212121' : '#FFFFFF';

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme,
      securityLevel: 'sandbox',
      flowchart: artifactFlowchartConfig,
    });

    const renderDiagram = async () => {
      if (!mermaidRef.current) {
        return;
      }

      try {
        const { svg } = await mermaid.render('mermaid-diagram', content);
        mermaidRef.current.innerHTML = svg;

        const svgElement = mermaidRef.current.querySelector('svg');
        if (svgElement) {
          svgElement.style.width = '100%';
          svgElement.style.height = '100%';
        }
        setIsRendered(true);
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = 'Error rendering diagram';
        }
      }
    };

    renderDiagram();
  }, [content, theme]);

  const centerAndFitDiagram = useCallback(() => {
    if (transformRef.current && mermaidRef.current) {
      const { centerView, zoomToElement } = transformRef.current;
      zoomToElement(mermaidRef.current as HTMLElement);
      centerView(1, 0);
    }
  }, []);

  useEffect(() => {
    if (isRendered) {
      centerAndFitDiagram();
    }
  }, [isRendered, centerAndFitDiagram]);

  const handlePanning = useCallback(() => {
    if (!transformRef.current) {
      return;
    }

    const { state, instance } = transformRef.current;
    if (!state || !instance) {
      return;
    }
    const { scale, positionX, positionY } = state;
    const { wrapperComponent, contentComponent } = instance;

    if (!wrapperComponent || !contentComponent) {
      return;
    }

    const wrapperRect = wrapperComponent.getBoundingClientRect();
    const contentRect = contentComponent.getBoundingClientRect();
    const maxX = wrapperRect.width - contentRect.width * scale;
    const maxY = wrapperRect.height - contentRect.height * scale;

    let newX = positionX;
    let newY = positionY;

    if (newX > 0) {
      newX = 0;
    }
    if (newY > 0) {
      newY = 0;
    }
    if (newX < maxX) {
      newX = maxX;
    }
    if (newY < maxY) {
      newY = maxY;
    }

    if (newX !== positionX || newY !== positionY) {
      instance.setTransformState(scale, newX, newY);
    }
  }, []);

  return (
    <div
      className="relative h-screen w-screen cursor-move p-5"
      style={{ backgroundColor: bgColor }}
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.1}
        maxScale={10}
        limitToBounds={false}
        centerOnInit={true}
        initialPositionY={0}
        wheel={{ step: 0.1 }}
        panning={{ velocityDisabled: true }}
        alignmentAnimation={{ disabled: true }}
        onPanning={handlePanning}
      >
        {({ zoomIn, zoomOut }) => (
          <>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden' }}
            >
              <div
                ref={mermaidRef}
                style={{ width: 'auto', height: 'auto', minWidth: '100%', minHeight: '100%' }}
              />
            </TransformComponent>
            <div className="absolute bottom-2 right-2 flex space-x-2">
              <Button onClick={() => zoomIn(0.1)} variant="outline" size="icon">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button onClick={() => zoomOut(0.1)} variant="outline" size="icon">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button onClick={centerAndFitDiagram} variant="outline" size="icon">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default MermaidDiagram;
