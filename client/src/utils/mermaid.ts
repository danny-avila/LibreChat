import dedent from 'dedent';

const mermaid = dedent(`import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import { Button } from './button'; // Live component

interface MermaidDiagramProps {
  content: string;
}
/** NOTE: This component is for testing purposes only, we stringify this for live rendering */
const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ content }) => {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        background: '#282C34',
        primaryColor: '#333842',
        secondaryColor: '#333842',
        tertiaryColor: '#333842',
        primaryTextColor: '#ABB2BF',
        secondaryTextColor: '#ABB2BF',
        lineColor: '#636D83',
        fontSize: '16px',
        nodeBorder: '#636D83',
        mainBkg: '#333842',
        altBackground: '#282C34',
        textColor: '#ABB2BF',
        edgeLabelBackground: '#282C34',
        clusterBkg: '#333842',
        clusterBorder: '#636D83',
        labelBoxBkgColor: '#333842',
        labelBoxBorderColor: '#636D83',
        labelTextColor: '#ABB2BF',
      },
      flowchart: {
        curve: 'basis',
        nodeSpacing: 50,
        rankSpacing: 50,
        diagramPadding: 8,
        htmlLabels: true,
        useMaxWidth: true,
        defaultRenderer: 'dagre-d3',
        padding: 15,
        wrappingWidth: 200,
      },
    });

    const renderDiagram = async () => {
      if (mermaidRef.current) {
        try {
          const { svg } = await mermaid.render('mermaid-diagram', content);
          mermaidRef.current.innerHTML = svg;

          const svgElement = mermaidRef.current.querySelector('svg');
          if (svgElement) {
            svgElement.style.width = '100%';
            svgElement.style.height = '100%';

            const pathElements = svgElement.querySelectorAll('path');
            pathElements.forEach((path) => {
              path.style.strokeWidth = '1.5px';
            });

            const rectElements = svgElement.querySelectorAll('rect');
            rectElements.forEach((rect) => {
              const parent = rect.parentElement;
              if (parent && parent.classList.contains('node')) {
                rect.style.stroke = '#636D83';
                rect.style.strokeWidth = '1px';
              } else {
                rect.style.stroke = 'none';
              }
            });
          }
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
    <div className="relative h-full w-full cursor-move bg-[#282C34] p-5">
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

export default MermaidDiagram`);

const wrapMermaidDiagram = (content: string) => {
  return dedent(`import React from 'react';
import MermaidDiagram from '/components/ui/MermaidDiagram';

export default App = () => (
  <MermaidDiagram content={\`${content}\`} />
);
`);
};

export const getMermaidFiles = (content: string) => {
  return {
    'App.tsx': wrapMermaidDiagram(content),
    '/components/ui/MermaidDiagram.tsx': mermaid,
  };
};
