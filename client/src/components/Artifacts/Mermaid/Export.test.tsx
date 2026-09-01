import React from 'react';
import { render } from '@testing-library/react';
import type { ProcessedMermaidSvg } from '~/utils/diagram/export';
import type { Artifact } from '~/common';
import { TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import MermaidExport from './Export';

interface ExportProps {
  svg?: string | null;
  dimensions?: ProcessedMermaidSvg['dimensions'];
  filename: string;
  buttonClassName?: string;
}

const mockExport = jest.fn((_props: ExportProps) => null);

jest.mock('~/components/Messages/Content/Mermaid/Export', () => ({
  __esModule: true,
  default: (props: ExportProps) => mockExport(props),
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      key,
}));

const artifact: Artifact = {
  id: 'tool-artifact-flow chart.mmd',
  type: TOOL_ARTIFACT_TYPES.MERMAID,
  title: 'flow.mmd',
  content: 'graph TD\nA-->B',
  lastUpdateTime: 1,
};

describe('Artifact Mermaid export', () => {
  beforeEach(() => {
    mockExport.mockClear();
  });

  it('reuses the SVG and dimensions already rendered by the Artifact preview', () => {
    const exportData: ProcessedMermaidSvg = {
      svg: '<svg viewBox="0 0 400 200" />',
      dimensions: { width: 400, height: 200 },
    };

    render(<MermaidExport artifact={artifact} exportData={exportData} />);

    expect(mockExport).toHaveBeenCalledWith(
      expect.objectContaining({
        svg: exportData.svg,
        dimensions: exportData.dimensions,
        filename: 'flow.mmd',
      }),
    );
    expect(mockExport.mock.calls[0][0]).not.toHaveProperty('source');
  });

  it('does not offer export before the preview SVG is ready', () => {
    render(<MermaidExport artifact={artifact} />);

    expect(mockExport).not.toHaveBeenCalled();
  });
});
