import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { Button } from '~/components/ui/Button';
import { ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface MermaidDiagramProps {
  content: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ content }) => {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#282a36',
        primaryColor: '#ff79c6',
        secondaryColor: '#bd93f9',
        tertiaryColor: '#50fa7b',
        primaryTextColor: '#f8f8f2',
        secondaryTextColor: '#6272a4',
        lineColor: '#ff79c6',
        fontSize: '16px',
      },
    });

    const renderDiagram = async () => {
      if (mermaidRef.current) {
        mermaidRef.current.innerHTML = content;
        try {
          const { svg } = await mermaid.render('mermaid-diagram', content);
          mermaidRef.current.innerHTML = svg;
          setIsRendered(true);
        } catch (error) {
          console.error('Mermaid rendering error:', error);
          mermaidRef.current.innerHTML = 'Error rendering diagram';
        }
      }
    };

    renderDiagram();
  }, [content]);

  const centerAndFitDiagram = () => {
    if (transformRef.current && mermaidRef.current) {
      const { centerView, zoomToElement } = transformRef.current;
      zoomToElement(mermaidRef.current as HTMLElement);
      centerView(1, 0);
    }
  };

  useEffect(() => {
    if (isRendered) {
      centerAndFitDiagram();
    }
  }, [isRendered]);

  const handlePanning = () => {
    if (transformRef.current) {
      const { state, instance } = transformRef.current;
      const { scale, positionX, positionY } = state;
      const { wrapperComponent, contentComponent } = instance;

      if (wrapperComponent && contentComponent) {
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
      }
    }
  };

  return (
    <div className="relative h-full w-full cursor-move bg-[#282a36] p-5">
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.1}
        maxScale={4}
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
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default MermaidDiagram;
