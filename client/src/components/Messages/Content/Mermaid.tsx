import React, { useEffect, useMemo, useState, memo } from 'react';
import copy from 'copy-to-clipboard';
import { Clipboard, CheckMark } from '@librechat/client';
import { useLocalize, useMermaid } from '~/hooks';
import cn from '~/utils/cn';

interface MermaidProps {
  /** Mermaid diagram content */
  children: string;
  /** Unique identifier */
  id?: string;
  /** Custom theme */
  theme?: string;
}

const Mermaid: React.FC<MermaidProps> = memo(({ children, id, theme }) => {
  const localize = useLocalize();
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  // Get SVG from hook
  const { svg, isLoading, error } = useMermaid({
    content: children,
    id,
    theme,
  });

  // Process SVG and create blob URL
  const processedSvg = useMemo(() => {
    if (!svg) {
      return null;
    }

    let finalSvg = svg;

    // Firefox fix: Ensure viewBox is set correctly
    if (!svg.includes('viewBox') && svg.includes('height=') && svg.includes('width=')) {
      const widthMatch = svg.match(/width="(\d+)"/);
      const heightMatch = svg.match(/height="(\d+)"/);

      if (widthMatch && heightMatch) {
        const width = widthMatch[1];
        const height = heightMatch[1];
        finalSvg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
      }
    }

    // Ensure SVG has proper XML namespace
    if (!finalSvg.includes('xmlns')) {
      finalSvg = finalSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    return finalSvg;
  }, [svg]);

  // Create blob URL for the SVG
  useEffect(() => {
    if (!processedSvg) {
      return;
    }

    const blob = new Blob([processedSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);

    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [processedSvg]);

  const handleCopy = () => {
    copy(children.trim(), { format: 'text/plain' });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
        <div className="relative flex items-center justify-between rounded-tl-md rounded-tr-md bg-gray-700 px-4 py-2 font-sans text-xs text-gray-200">
          <span>mermaid</span>
        </div>
        <div className="flex min-h-[200px] items-center justify-center p-4">
          <div className="text-center">
            <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
            <div className="text-sm text-gray-400">
              {localize('com_ui_loading') || 'Rendering diagram...'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
        <div className="relative flex items-center justify-between rounded-tl-md rounded-tr-md bg-gray-700 px-4 py-2 font-sans text-xs text-gray-200">
          <span>mermaid</span>
          <button
            type="button"
            className="ml-auto flex gap-2 rounded-sm focus:outline focus:outline-white"
            onClick={handleCopy}
          >
            {isCopied ? (
              <>
                <CheckMark className="h-[18px] w-[18px]" />
                {localize('com_ui_copied')}
              </>
            ) : (
              <>
                <Clipboard />
                {localize('com_ui_copy_code')}
              </>
            )}
          </button>
        </div>
        <div className="rounded-b-md border border-red-500/30 bg-red-500/10 p-4">
          <div className="mb-2 font-semibold text-red-400">Failed to render diagram:</div>
          <pre className="overflow-auto text-xs text-red-300">{error.message}</pre>
          <div className="mt-4 border-t border-gray-700 pt-4">
            <div className="mb-2 text-xs text-gray-400">Source code:</div>
            <pre className="overflow-auto whitespace-pre-wrap text-xs text-gray-300">
              {children}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (!blobUrl) {
    return null;
  }

  return (
    <div className="w-full rounded-md bg-gray-900 text-xs text-white/80">
      <div className="relative flex items-center justify-between rounded-tl-md rounded-tr-md bg-gray-700 px-4 py-2 font-sans text-xs text-gray-200">
        <span>mermaid</span>
        <button
          type="button"
          className="ml-auto flex gap-2 rounded-sm focus:outline focus:outline-white"
          onClick={handleCopy}
        >
          {isCopied ? (
            <>
              <CheckMark className="h-[18px] w-[18px]" />
              {localize('com_ui_copied')}
            </>
          ) : (
            <>
              <Clipboard />
              {localize('com_ui_copy_code')}
            </>
          )}
        </button>
      </div>
      <div
        className={cn(
          'flex justify-center overflow-auto rounded-b-md p-4',
          'bg-white dark:bg-gray-800',
        )}
      >
        <img src={blobUrl} alt="Mermaid diagram" className="max-h-[600px] max-w-full" />
      </div>
    </div>
  );
});

Mermaid.displayName = 'Mermaid';

export default Mermaid;
