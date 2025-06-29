import React, { useLayoutEffect, useState, memo, useContext, useMemo, useCallback } from 'react';
import mermaid from 'mermaid';
import { cn } from '~/utils';
import { ThemeContext, isDark } from '~/hooks/ThemeContext';
import { ClipboardIcon, CheckIcon } from 'lucide-react';

interface InlineMermaidProps {
  content: string;
  className?: string;
}

const InlineMermaidDiagram = memo(({ content, className }: InlineMermaidProps) => {
  const [svgContent, setSvgContent] = useState<string>('');
  const [isRendered, setIsRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [wasAutoCorrected, setWasAutoCorrected] = useState(false);
  const { theme } = useContext(ThemeContext);
  const isDarkMode = isDark(theme);

  const diagramKey = useMemo(
    () => `${content.trim()}-${isDarkMode ? 'dark' : 'light'}`,
    [content, isDarkMode],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy diagram content:', err);
    }
  }, [content]);

  // Memoized to prevent re-renders when content/theme changes
  const fixCommonSyntaxIssues = useMemo(() => {
    return (text: string) => {
      let fixed = text;

      fixed = fixed.replace(/--\s+>/g, '-->');
      fixed = fixed.replace(/--\s+\|/g, '--|');
      fixed = fixed.replace(/\|\s+-->/g, '|-->');
      fixed = fixed.replace(/\[([^[\]]*)"([^[\]]*)"([^[\]]*)\]/g, '[$1$2$3]');
      fixed = fixed.replace(/subgraph([A-Za-z])/g, 'subgraph $1');

      return fixed;
    };
  }, []);

  const handleTryFix = useCallback(() => {
    const fixedContent = fixCommonSyntaxIssues(content);
    if (fixedContent !== content) {
      // Currently just copies the fixed version to clipboard
      navigator.clipboard.writeText(fixedContent).then(() => {
        setError(`Potential fix copied to clipboard. Common issues found and corrected.`);
      });
    }
  }, [content, fixCommonSyntaxIssues]);

  // Use ref to track timeout to prevent stale closures
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  useLayoutEffect(() => {
    let isCancelled = false;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const cleanContent = content.trim();

    setError(null);
    setWasAutoCorrected(false);
    setIsRendered(false);

    if (!cleanContent) {
      setError('No diagram content provided');
      return;
    }

    // Debounce rendering to avoid flickering during rapid content changes
    timeoutRef.current = setTimeout(() => {
      if (!isCancelled) {
        renderDiagram();
      }
    }, 300);

    async function renderDiagram() {
      if (isCancelled) return;

      try {
        if (
          !cleanContent.match(
            /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitgraph|mindmap|timeline|quadrant|block-beta|sankey|xychart|gitgraph)/i,
          )
        ) {
          if (!isCancelled) {
            setError(
              'Invalid Mermaid syntax - diagram must start with a valid diagram type (flowchart, graph, sequenceDiagram, etc.)',
            );
            setWasAutoCorrected(false);
          }
          return;
        }

        // Initialize with error suppression to avoid console spam
        mermaid.initialize({
          startOnLoad: false,
          theme: isDarkMode ? 'dark' : 'default',
          securityLevel: 'loose',
          logLevel: 'fatal',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
          },
          suppressErrorRendering: true,
        });

        let result;
        let contentToRender = cleanContent;

        try {
          const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          result = await mermaid.render(id, contentToRender);
        } catch (_renderError) {
          const fixedContent = fixCommonSyntaxIssues(cleanContent);
          if (fixedContent !== cleanContent) {
            try {
              const fixedId = `mermaid-fixed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              result = await mermaid.render(fixedId, fixedContent);
              contentToRender = fixedContent;
              setWasAutoCorrected(true);
            } catch (_fixedRenderError) {
              if (!isCancelled) {
                setError('Invalid diagram syntax - syntax errors found but unable to auto-correct');
                setWasAutoCorrected(false);
              }
              return;
            }
          } else {
            if (!isCancelled) {
              setError('Invalid diagram syntax - check arrow formatting and node labels');
              setWasAutoCorrected(false);
            }
            return;
          }
        }

        // Check if component was unmounted during async render
        if (isCancelled) {
          return;
        }

        if (result && result.svg) {
          let processedSvg = result.svg;

          processedSvg = processedSvg.replace(
            '<svg',
            '<svg style="max-width: 600px; width: 100%; height: auto; max-height: 400px;" preserveAspectRatio="xMidYMid meet"',
          );

          if (!isCancelled) {
            setSvgContent(processedSvg);
            setIsRendered(true);
          }
        } else {
          if (!isCancelled) {
            setError('No SVG generated - rendering failed unexpectedly');
            setWasAutoCorrected(false);
          }
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        if (!isCancelled) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to render diagram';
          setError(`Rendering failed: ${errorMessage}`);
          setWasAutoCorrected(false);
        }
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [diagramKey, content, isDarkMode, fixCommonSyntaxIssues]);

  useLayoutEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  if (error) {
    const fixedContent = fixCommonSyntaxIssues(content);
    const canTryFix = fixedContent !== content;

    return (
      <div
        className={cn(
          'my-4 overflow-auto rounded-lg border border-red-300 bg-red-50',
          'dark:border-red-700 dark:bg-red-900/20',
          className,
        )}
      >
        <div className="p-4 text-red-600 dark:text-red-400">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <strong>{'Mermaid Error:'}</strong> {error}
              {canTryFix && (
                <div className={cn('mt-2 text-sm text-red-500 dark:text-red-300')}>
                  {'💡 Potential fixes detected: spacing issues in arrows or labels'}
                </div>
              )}
            </div>
            <div className="ml-4 flex gap-2">
              {canTryFix && (
                <button
                  onClick={handleTryFix}
                  className={cn(
                    'rounded border px-3 py-1 text-xs transition-colors',
                    'border-blue-300 bg-blue-100 text-blue-700 hover:bg-blue-200',
                    'dark:border-blue-700 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800',
                  )}
                  title="Copy potential fix to clipboard"
                >
                  {'Try Fix'}
                </button>
              )}
              <button
                onClick={handleCopy}
                className={cn(
                  'rounded border px-3 py-1 text-xs transition-colors',
                  'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200',
                  'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
                title="Copy mermaid code"
              >
                {isCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
        <div className="p-4 pt-0">
          <pre className="overflow-x-auto rounded bg-gray-100 p-2 text-sm dark:bg-gray-800">
            <code className="language-mermaid">{content}</code>
          </pre>
          {canTryFix && (
            <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
              <div className={cn('mb-2 text-sm font-medium text-blue-800 dark:text-blue-200')}>
                {'Suggested Fix:'}
              </div>
              <pre className="overflow-x-auto rounded border bg-white p-2 text-sm dark:bg-gray-800">
                <code className="language-mermaid">{fixedContent}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      key={diagramKey}
      className={cn(
        'relative my-4 overflow-auto rounded-lg border border-border-light bg-surface-primary',
        'dark:border-border-heavy dark:bg-surface-primary-alt',
        className,
      )}
    >
      {isRendered && wasAutoCorrected && (
        <div
          className={cn(
            'absolute left-2 top-2 z-10 rounded-md px-2 py-1 text-xs',
            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
            'border border-yellow-300 dark:border-yellow-700',
            'shadow-sm',
          )}
        >
          {'✨ Auto-fixed'}
        </div>
      )}

      {isRendered && svgContent && (
        <button
          onClick={handleCopy}
          className={cn(
            'absolute right-2 top-2 z-10 rounded-md p-2 transition-all duration-200',
            'hover:bg-surface-hover active:bg-surface-active',
            'text-text-secondary hover:text-text-primary',
            'border border-border-light dark:border-border-heavy',
            'bg-surface-primary dark:bg-surface-primary-alt',
            'shadow-sm hover:shadow-md',
          )}
          title="Copy mermaid code"
        >
          {isCopied ? (
            <CheckIcon className="h-4 w-4 text-green-500" />
          ) : (
            <ClipboardIcon className="h-4 w-4" />
          )}
        </button>
      )}

      <div className="p-4 text-center">
        {!isRendered && (
          <div className="animate-pulse text-text-secondary">Rendering diagram...</div>
        )}
        {isRendered && svgContent && (
          <div
            className="mermaid-container flex justify-center"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>
    </div>
  );
});

InlineMermaidDiagram.displayName = 'InlineMermaidDiagram';

export default InlineMermaidDiagram;
