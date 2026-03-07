import { useMemo } from 'react';
import { detectOutputType, OutputType } from '../ToolOutput/detectOutputType';
import TableOutput from '../ToolOutput/TableOutput';

interface StdoutProps {
  output?: string;
}

export default function Stdout({ output = '' }: StdoutProps) {
  const processedContent = useMemo(() => {
    if (!output) {
      return '';
    }
    const parts = output.split('Generated files:');
    return parts[0].trim();
  }, [output]);

  const detected = useMemo(
    () => (processedContent ? detectOutputType(processedContent) : null),
    [processedContent],
  );

  if (!processedContent || !detected) {
    return null;
  }

  if (detected.type === OutputType.TABLE && detected.parsed) {
    return <TableOutput data={detected.parsed as Record<string, unknown>[]} />;
  }

  return (
    <pre className="shrink-0 whitespace-pre-wrap break-words font-mono text-text-primary">
      {processedContent}
    </pre>
  );
}
