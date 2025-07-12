import React, { memo, useMemo, useEffect } from 'react';
import { SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react/unstyled';
import dedent from 'dedent';
import { cn } from '~/utils';
import { sharedOptions } from '~/utils/artifacts';

interface SandpackMermaidDiagramProps {
  content: string;
  className?: string;
}

// Minimal dependencies for Mermaid only
const mermaidDependencies = {
  mermaid: '^11.8.1',
  'react-zoom-pan-pinch': '^3.7.0',
};

// Lean mermaid template with inline SVG icons
const leanMermaidTemplate = dedent`
import React, { useEffect, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import mermaid from "mermaid";

// Inline SVG icons
const ZoomInIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.35-4.35"/>
    <line x1="11" y1="8" x2="11" y2="14"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);

const ZoomOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.35-4.35"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);

const ResetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="1 4 1 10 7 10"/>
    <polyline points="23 20 23 14 17 14"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
  </svg>
);

interface MermaidDiagramProps {
  content: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ content }) => {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: "basis",
      },
    });

    const renderDiagram = async () => {
      if (mermaidRef.current) {
        try {
          const id = "mermaid-" + Date.now();
          const { svg } = await mermaid.render(id, content);
          mermaidRef.current.innerHTML = svg;

          const svgElement = mermaidRef.current.querySelector("svg");
          if (svgElement) {
            svgElement.style.width = "100%";
            svgElement.style.height = "100%";
          }
          setIsRendered(true);
          setError(null);
        } catch (err) {
          console.error("Mermaid rendering error:", err);
          setError(err.message || "Failed to render diagram");
        }
      }
    };

    renderDiagram();
  }, [content]);

  const handleZoomIn = () => {
    if (transformRef.current) {
      transformRef.current.zoomIn(0.2);
    }
  };

  const handleZoomOut = () => {
    if (transformRef.current) {
      transformRef.current.zoomOut(0.2);
    }
  };

  const handleReset = () => {
    if (transformRef.current) {
      transformRef.current.resetTransform();
      transformRef.current.centerView(1, 0);
    }
  };

  if (error) {
    return (
      <div style={{ padding: '16px', color: '#ef4444', backgroundColor: '#fee2e2', borderRadius: '8px', border: '1px solid #fecaca' }}>
        <strong>Error:</strong> {error}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', backgroundColor: '#f9fafb' }}>
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.1}
        maxScale={4}
        wheel={{ step: 0.1 }}
        centerOnInit={true}
      >
        <TransformComponent
          wrapperStyle={{
            width: "100%",
            height: "100%",
          }}
        >
          <div
            ref={mermaidRef}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
              padding: '20px',
            }}
          />
        </TransformComponent>
      </TransformWrapper>
      
      {isRendered && (
        <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '8px' }}>
          <button
            onClick={handleZoomIn}
            style={{
              padding: '8px',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Zoom in"
          >
            <ZoomInIcon />
          </button>
          <button
            onClick={handleZoomOut}
            style={{
              padding: '8px',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Zoom out"
          >
            <ZoomOutIcon />
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: '8px',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Reset zoom"
          >
            <ResetIcon />
          </button>
        </div>
      )}
    </div>
  );
};

export default MermaidDiagram;
`;

const wrapLeanMermaidDiagram = (content: string) => {
  return dedent`
import React from 'react';
import MermaidDiagram from './MermaidDiagram';

export default function App() {
  const content = \`${content.replace(/`/g, '\\`')}\`;
  return <MermaidDiagram content={content} />;
}
`;
};

const getLeanMermaidFiles = (content: string) => {
  return {
    '/App.tsx': wrapLeanMermaidDiagram(content),
    '/MermaidDiagram.tsx': leanMermaidTemplate,
  };
};

const SandpackMermaidDiagram = memo(({ content, className }: SandpackMermaidDiagramProps) => {
  const files = useMemo(() => getLeanMermaidFiles(content), [content]);
  const sandpackProps = useMemo(
    () => ({
      customSetup: {
        dependencies: mermaidDependencies,
      },
    }),
    [],
  );

  // Force iframe to respect container height
  useEffect(() => {
    const fixIframeHeight = () => {
      const container = document.querySelector('.sandpack-mermaid-diagram');
      if (container) {
        const iframe = container.querySelector('iframe');
        if (iframe && iframe.style.height && iframe.style.height !== '100%') {
          iframe.style.height = '100%';
          iframe.style.minHeight = '100%';
        }
      }
    };

    // Initial fix
    fixIframeHeight();

    // Fix on any DOM changes
    const observer = new MutationObserver(fixIframeHeight);
    const container = document.querySelector('.sandpack-mermaid-diagram');
    if (container) {
      observer.observe(container, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['style'],
      });
    }

    return () => observer.disconnect();
  }, [content]);

  return (
    <SandpackProvider files={files} options={sharedOptions} template="react-ts" {...sandpackProps}>
      <SandpackPreview
        showOpenInCodeSandbox={false}
        showRefreshButton={false}
        showSandpackErrorOverlay={true}
      />
    </SandpackProvider>
  );
});

SandpackMermaidDiagram.displayName = 'SandpackMermaidDiagram';

export default SandpackMermaidDiagram;
