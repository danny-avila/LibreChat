import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidProps {
  chart: string;
}

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const mermaidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'strict',
    });
    mermaid.contentLoaded();
  }, []);

  useEffect(() => {
    if (chart && mermaidRef.current) {
      mermaid.render('mermaid-svg', chart).then((svgCode) => {
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = svgCode.svg;
        }
      });
    }
  }, [chart]);

  return <div ref={mermaidRef} />;
};

export default Mermaid;
