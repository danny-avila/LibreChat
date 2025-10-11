import dedent from 'dedent';

const mermaid = dedent(`import React, { useEffect, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import mermaid from "mermaid";
import { Button } from "/components/ui/button";

const ZoomIn = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" x2="16.65" y1="21" y2="16.65"/>
    <line x1="11" x2="11" y1="8" y2="14"/>
    <line x1="8" x2="14" y1="11" y2="11"/>
  </svg>
);

const ZoomOut = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" x2="16.65" y1="21" y2="16.65"/>
    <line x1="8" x2="14" y1="11" y2="11"/>
  </svg>
);

const RefreshCw = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>
  </svg>
);

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
      theme: "base",
      themeVariables: {
        background: "#282C34",
        primaryColor: "#333842",
        secondaryColor: "#333842",
        tertiaryColor: "#333842",
        primaryTextColor: "#ABB2BF",
        secondaryTextColor: "#ABB2BF",
        lineColor: "#636D83",
        fontSize: "16px",
        nodeBorder: "#636D83",
        mainBkg: '#282C34',
        altBackground: '#282C34',
        textColor: '#ABB2BF',
        edgeLabelBackground: '#282C34',
        clusterBkg: '#282C34',
        clusterBorder: "#636D83",
        labelBoxBkgColor: "#333842",
        labelBoxBorderColor: "#636D83",
        labelTextColor: "#ABB2BF",
      },
      flowchart: {
        curve: "basis",
        nodeSpacing: 50,
        rankSpacing: 50,
        diagramPadding: 8,
        htmlLabels: true,
        useMaxWidth: true,
        padding: 15,
        wrappingWidth: 200,
      },
    });

    const renderDiagram = async () => {
      if (mermaidRef.current) {
        try {
          const { svg } = await mermaid.render("mermaid-diagram", content);
          mermaidRef.current.innerHTML = svg;

          const svgElement = mermaidRef.current.querySelector("svg");
          if (svgElement) {
            svgElement.style.width = "100%";
            svgElement.style.height = "100%";

            const pathElements = svgElement.querySelectorAll("path");
            pathElements.forEach((path) => {
              path.style.strokeWidth = "1.5px";
            });

            const rectElements = svgElement.querySelectorAll("rect");
            rectElements.forEach((rect) => {
              const parent = rect.parentElement;
              if (parent && parent.classList.contains("node")) {
                rect.style.stroke = "#636D83";
                rect.style.strokeWidth = "1px";
              } else {
                rect.style.stroke = "none";
              }
            });
          }
          setIsRendered(true);
        } catch (error) {
          console.error("Mermaid rendering error:", error);
          mermaidRef.current.innerHTML = "Error rendering diagram";
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
      if (!state) {
        return;
      }
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
    <div className="relative h-screen w-screen cursor-move bg-[#282C34] p-5">
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
              wrapperStyle={{
                width: "100%",
                height: "100%",
                overflow: "hidden",
              }}
            >
              <div
                ref={mermaidRef}
                style={{
                  width: "auto",
                  height: "auto",
                  minWidth: "100%",
                  minHeight: "100%",
                }}
              />
            </TransformComponent>
            <div className="absolute bottom-2 right-2 flex space-x-2">
              <Button onClick={() => zoomIn(0.1)} variant="outline" size="icon">
                <ZoomIn />
              </Button>
              <Button
                onClick={() => zoomOut(0.1)}
                variant="outline"
                size="icon"
              >
                <ZoomOut />
              </Button>
              <Button
                onClick={centerAndFitDiagram}
                variant="outline"
                size="icon"
              >
                <RefreshCw />
              </Button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default MermaidDiagram;`);

const wrapMermaidDiagram = (content: string) => {
  return dedent(`import React from 'react';
import MermaidDiagram from '/components/ui/MermaidDiagram';

export default App = () => (
  <MermaidDiagram content={\`${content}\`} />
);
`);
};

const mermaidCSS = `
body {
  background-color: #282C34;
}
`;

export const getMermaidFiles = (content: string) => {
  return {
    'diagram.mmd': content || '# No mermaid diagram content provided',
    'App.tsx': wrapMermaidDiagram(content),
    'index.tsx': dedent(`import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./mermaid.css";

import App from "./App";

const root = createRoot(document.getElementById("root"));
root.render(<App />);
;`),
    '/components/ui/MermaidDiagram.tsx': mermaid,
    'mermaid.css': mermaidCSS,
  };
};
