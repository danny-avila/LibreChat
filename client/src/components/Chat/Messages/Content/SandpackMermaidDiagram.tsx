import React, { memo, useMemo, useState, useEffect } from 'react';
import { SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react/unstyled';
import { cn } from '~/utils';
import { sharedOptions } from '~/utils/artifacts';
import CodeBlock from '~/components/Messages/Content/CodeBlock';

interface SandpackMermaidDiagramProps {
  content: string;
  className?: string;
  fallbackToCodeBlock?: boolean;
}

const mermaidDependencies = {
  mermaid: '^11.4.1',
  'react-zoom-pan-pinch': '^3.6.1',
  'copy-to-clipboard': '^3.3.3',
};

const mermaidTemplate = `
import React, { useEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import mermaid from "mermaid";
import copy from "copy-to-clipboard";

export default function MermaidDiagram({ content }) {
  const containerRef = useRef(null);
  const [svgContent, setSvgContent] = useState("");
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    copy(content, { format: 'text/plain' });
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };
  
  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: false, 
      theme: "default"
    });
    
    mermaid.render("mermaid-diagram-" + Math.random().toString(36).substr(2, 9), content)
      .then(({ svg }) => {
        // Remove fixed width/height attributes from SVG
        let processedSvg = svg.replace(/\\s(width|height)="[^"]*"/g, '');
        
        // Add responsive styling
        processedSvg = processedSvg.replace(
          '<svg',
          '<svg style="width:100%;height:auto;max-width:100%;" preserveAspectRatio="xMidYMid meet"'
        );
        
        setSvgContent(processedSvg);
      })
      .catch((err) => {
        console.error("Mermaid error:", err);
        // Show the mermaid code with error message when parsing fails
        const errorHtml = 
          '<div style="padding: 20px; font-family: monospace;">' +
            '<div style="color: #dc2626; margin-bottom: 10px; font-weight: bold;">' +
              'Mermaid Syntax Error: ' + (err.message || 'Invalid diagram syntax') +
            '</div>' +
            '<pre style="background: #f3f4f6; padding: 15px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; color: #374151;">' +
              content.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
            '</pre>' +
          '</div>';
        setSvgContent(errorHtml);
      });
  }, [content]);
  
  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <TransformWrapper
        initialScale={0.3}
        minScale={0.2}
        maxScale={4}
        centerOnInit={true}
        centerZoomedOut={true}
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: true }}
        alignmentAnimation={{ sizeX: 0, sizeY: 0 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperStyle={{
                width: "100%",
                height: "100%"
              }}
              contentStyle={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <div 
                dangerouslySetInnerHTML={{ __html: svgContent }}
                style={{ 
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center"
                }} 
              />
            </TransformComponent>
            <div style={{ position: "absolute", top: "10px", right: "10px", display: "flex", gap: "8px", zIndex: 50 }}>
              <button 
                onClick={handleCopy} 
                style={{ 
                  padding: "8px", 
                  background: "#ffffff", 
                  border: "1px solid #d1d5db", 
                  borderRadius: "6px", 
                  cursor: "pointer",
                  color: "#374151",
                  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
                  transition: "all 0.2s",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                onMouseEnter={(e) => { e.target.style.background = "#f3f4f6"; e.target.style.boxShadow = "0 2px 4px 0 rgba(0, 0, 0, 0.1)"; }}
                onMouseLeave={(e) => { e.target.style.background = "#ffffff"; e.target.style.boxShadow = "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)"; }}
                title={copied ? "Copied!" : "Copy"}
              >
                {copied ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4V5" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                )}
              </button>
              <button 
                onClick={() => zoomOut()} 
                style={{ 
                  padding: "8px", 
                  background: "rgba(255, 255, 255, 0.9)", 
                  border: "1px solid #e5e7eb", 
                  borderRadius: "6px", 
                  cursor: "pointer",
                  fontSize: "18px",
                  fontWeight: "500",
                  color: "#374151",
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                  transition: "all 0.2s",
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                onMouseEnter={(e) => e.target.style.background = "#f9fafb"}
                onMouseLeave={(e) => e.target.style.background = "rgba(255, 255, 255, 0.9)"}
                title="Zoom out"
              >
                −
              </button>
              <button 
                onClick={() => zoomIn()} 
                style={{ 
                  padding: "8px", 
                  background: "rgba(255, 255, 255, 0.9)", 
                  border: "1px solid #e5e7eb", 
                  borderRadius: "6px", 
                  cursor: "pointer",
                  fontSize: "18px",
                  fontWeight: "500",
                  color: "#374151",
                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                  transition: "all 0.2s",
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                onMouseEnter={(e) => e.target.style.background = "#f9fafb"}
                onMouseLeave={(e) => e.target.style.background = "rgba(255, 255, 255, 0.9)"}
                title="Zoom in"
              >
                +
              </button>
              <button 
                onClick={() => resetTransform()} 
                style={{ 
                  padding: "8px 12px", 
                  background: "#ffffff", 
                  border: "1px solid #d1d5db", 
                  borderRadius: "6px", 
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "#374151",
                  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => { e.target.style.background = "#f3f4f6"; e.target.style.boxShadow = "0 2px 4px 0 rgba(0, 0, 0, 0.1)"; }}
                onMouseLeave={(e) => { e.target.style.background = "#ffffff"; e.target.style.boxShadow = "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)"; }}
                title="Reset zoom"
              >
                Reset
              </button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
`;

const SandpackMermaidDiagram = memo(
  ({ content, className, fallbackToCodeBlock }: SandpackMermaidDiagramProps) => {
    const mermaidContent = content || 'graph TD\n  A[No content provided] --> B[Error]';
    const [hasError, setHasError] = useState(false);

    const files = useMemo(
      () => ({
        '/App.tsx': `import React from 'react';
import MermaidDiagram from './MermaidDiagram';

export default function App() {
  const content = \`${mermaidContent.replace(/`/g, '\\`')}\`;
  return <MermaidDiagram content={content} />;
}`,
        '/MermaidDiagram.tsx': mermaidTemplate,
      }),
      [mermaidContent],
    );

    const key = useMemo(() => {
      let hash = 0;
      for (let i = 0; i < mermaidContent.length; i++) {
        hash = (hash << 5) - hash + mermaidContent.charCodeAt(i);
      }
      return hash.toString(36);
    }, [mermaidContent]);

    // Check if mermaid content is valid by attempting to parse it
    useEffect(() => {
      if (!fallbackToCodeBlock) return;

      // Simple validation check for common mermaid syntax errors
      const trimmedContent = mermaidContent.trim();
      const hasValidStart =
        /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph)/i.test(
          trimmedContent,
        );

      if (!hasValidStart || trimmedContent.includes('Mermaid Syntax Error')) {
        setHasError(true);
      }
    }, [mermaidContent, fallbackToCodeBlock]);

    // If there's an error and fallback is enabled, show as code block
    if (fallbackToCodeBlock && hasError) {
      return <CodeBlock lang="mermaid" codeChildren={content} allowExecution={false} />;
    }

    return (
      <div
        className={cn(
          'my-4 overflow-hidden rounded-lg border border-border-light bg-surface-primary',
          'dark:border-border-heavy dark:bg-surface-primary-alt',
          className,
        )}
        style={{ height: '400px' }}
      >
        <SandpackProvider
          key={key}
          files={files}
          options={sharedOptions}
          template="react-ts"
          customSetup={{ dependencies: mermaidDependencies }}
        >
          <SandpackPreview
            showOpenInCodeSandbox={false}
            showRefreshButton={false}
            style={{ height: '100%' }}
          />
        </SandpackProvider>
      </div>
    );
  },
);

SandpackMermaidDiagram.displayName = 'SandpackMermaidDiagram';

export default SandpackMermaidDiagram;
