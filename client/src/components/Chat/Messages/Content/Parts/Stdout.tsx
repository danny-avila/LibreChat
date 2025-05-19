import React, { useMemo } from 'react';

interface StdoutProps {
  output?: string;
}

const Stdout: React.FC<StdoutProps> = ({ output = '' }) => {
  const processedContent = useMemo(() => {
    if (!output) {
      return '';
    }

    const parts = output.split('Generated files:');
    return parts[0].trim();
  }, [output]);

  return (
    processedContent && (
      <pre className="shrink-0">
        <div className="text-text-primary">{processedContent}</div>
      </pre>
    )
  );
};

export default Stdout;
