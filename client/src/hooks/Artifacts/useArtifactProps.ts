import { useMemo } from 'react';
import { removeNullishValues } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import { getKey, getProps, getTemplate, getArtifactFilename } from '~/utils/artifacts';

export default function useArtifactProps({ artifact }: { artifact: Artifact }) {
  const [fileKey, files] = useMemo(() => {
    if (getKey(artifact.type ?? '', artifact.language).includes('mermaid')) {
      const mermaidFiles = {
        'App.tsx': `import React from 'react';
import MermaidDiagram from './MermaidDiagram';

export default function App() {
  const content = \`${(artifact.content ?? '').replace(/`/g, '\\`')}\`;
  return <MermaidDiagram content={content} />;
}`,
        'MermaidDiagram.tsx': `import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

export default function MermaidDiagram({ content }) {
  const ref = useRef(null);
  
  useEffect(() => {
    if (ref.current) {
      mermaid.initialize({ startOnLoad: true, theme: 'default' });
      mermaid.render('mermaid-diagram', content).then(({ svg }) => {
        ref.current.innerHTML = svg;
      });
    }
  }, [content]);
  
  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}`,
      };
      return ['App.tsx', mermaidFiles];
    }

    const fileKey = getArtifactFilename(artifact.type ?? '', artifact.language);
    const files = removeNullishValues({
      [fileKey]: artifact.content,
    });
    return [fileKey, files];
  }, [artifact.type, artifact.content, artifact.language]);

  const template = useMemo(
    () => getTemplate(artifact.type ?? '', artifact.language),
    [artifact.type, artifact.language],
  );

  const sharedProps = useMemo(() => getProps(artifact.type ?? ''), [artifact.type]);

  return {
    files,
    fileKey,
    template,
    sharedProps,
  };
}
