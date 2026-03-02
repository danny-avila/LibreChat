import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useLocalize } from '~/hooks';

interface TavilyResult {
  title?: string;
  url: string;
  content?: string;
  score?: number;
  raw_content?: string;
}

interface TavilyResponse {
  query?: string;
  answer?: string;
  results?: TavilyResult[];
  images?: Array<{
    url: string;
    description?: string;
  }>;
  follow_up_questions?: string[];
  response_time?: number;
}

interface TavilySourcesProps {
  output: string;
  showFallback?: (show: boolean) => void;
}

export default function TavilySources({ output, showFallback }: TavilySourcesProps) {
  const localize = useLocalize();
  const parsedData = React.useMemo(() => {
    try {
      // First, try to parse the output as JSON
      let data = JSON.parse(output);

      // Check if it's an MCP response format: [{"type":"text","text":"..."}]
      if (Array.isArray(data) && data[0]?.type === 'text' && data[0]?.text) {
        // Parse the inner text field which contains the actual Tavily response
        data = JSON.parse(data[0].text);
      }

      return data as TavilyResponse;
    } catch (_e) {
      return null;
    }
  }, [output]);

  // If parsing failed or no results, return null to let parent show raw JSON
  React.useEffect(() => {
    if (!parsedData || !parsedData.results || parsedData.results.length === 0) {
      showFallback?.(true);
    } else {
      showFallback?.(false);
    }
  }, [parsedData, showFallback]);

  if (!parsedData || !parsedData.results || parsedData.results.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Answer section if available */}
      {parsedData.answer && (
        <div className="rounded-lg bg-surface-tertiary p-3">
          <div className="mb-1.5 text-xs font-semibold text-text-secondary">
            {localize('com_ui_result')}
          </div>
          <div className="text-sm text-text-primary">{parsedData.answer}</div>
        </div>
      )}

      {/* Sources section */}
      <div>
        <div className="mb-2 text-xs font-semibold text-text-secondary">
          {localize('com_sources_title')} ({parsedData.results.length})
        </div>
        <div className="space-y-2">
          {parsedData.results.map((result, index) => (
            <a
              key={index}
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-lg border border-border-light bg-surface-primary-contrast p-3 transition-all duration-200 hover:border-border-medium hover:bg-surface-tertiary hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {/* Title */}
                  <div className="mb-1 flex items-center gap-1.5">
                    <h4 className="line-clamp-1 text-sm font-semibold text-text-primary group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {result.title || localize('com_ui_untitled')}
                    </h4>
                    <ExternalLink className="h-3 w-3 flex-shrink-0 text-text-secondary opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>

                  {/* URL */}
                  <div className="mb-1.5 truncate text-xs text-text-secondary">
                    {(() => {
                      try {
                        return new URL(result.url).hostname;
                      } catch {
                        return result.url;
                      }
                    })()}
                  </div>

                  {/* Content snippet */}
                  {result.content && (
                    <p className="line-clamp-2 text-xs text-text-secondary">{result.content}</p>
                  )}
                </div>

                {/* Score badge if available */}
                {result.score !== undefined && (
                  <div className="flex-shrink-0">
                    <span
                      className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      title="Relevance score: how well this result matches your search"
                    >
                      {(result.score * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Follow-up questions if available */}
      {parsedData.follow_up_questions && parsedData.follow_up_questions.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-text-secondary">
            {localize('com_ui_examples')}
          </div>
          <div className="space-y-1">
            {parsedData.follow_up_questions.map((question, index) => (
              <div
                key={index}
                className="rounded-md bg-surface-tertiary px-3 py-2 text-xs text-text-primary"
              >
                {question}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
