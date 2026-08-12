import React, { memo } from 'react';
import type { ProcessedMermaidSvg } from '~/utils/diagram/export';
import type { Artifact } from '~/common';
import MermaidExport from '~/components/Messages/Content/Mermaid/Export';
import { useLocalize } from '~/hooks';

const ArtifactMermaidExport = memo(function ArtifactMermaidExport({
  artifact,
  exportData,
  portalElement,
}: {
  artifact: Artifact;
  exportData?: ProcessedMermaidSvg | null;
  portalElement?: HTMLElement | null;
}) {
  const localize = useLocalize();

  if (exportData == null) {
    return null;
  }

  return (
    <MermaidExport
      key={artifact.id}
      svg={exportData.svg}
      dimensions={exportData.dimensions}
      filename={artifact.title ?? localize('com_ui_mermaid_diagram')}
      buttonClassName="h-9 w-9 p-0"
      portalElement={portalElement}
    />
  );
});

ArtifactMermaidExport.displayName = 'ArtifactMermaidExport';

export default ArtifactMermaidExport;
