import { useMemo, useState } from 'react';
import { Tools } from 'librechat-data-provider';
import type { TAttachment } from 'librechat-data-provider';
import { Checkbox, Button } from '@librechat/client';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import type { TPinnedWebSource } from '~/common';
import { cn } from '~/utils';

function getFavicon(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?sz=64&domain=${parsed.hostname}`;
  } catch {
    return null;
  }
}

const normalize = (value?: string | null) =>
  (value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();

type WebResultsProps = {
  attachments: TAttachment[];
};

type WebResult = {
  id: string;
  toolCallId: string;
  messageId: string;
  rank: number;
  url: string;
  title?: string;
  snippet?: string;
  text?: string;
  score?: number | null;
};

export default function WebResults({ attachments }: WebResultsProps) {
  const localize = useLocalize();
  const { optionSettings, setOptionSettings } = useChatContext();
  const pinnedSources = optionSettings?.pinnedWebSources ?? [];

  const results = useMemo<WebResult[]>(() => {
    const map = new Map<string, WebResult>();

    attachments.forEach((attachment) => {
      if (attachment.type !== Tools.web_search || !attachment[Tools.web_search]) {
        return;
      }

      const organic = attachment[Tools.web_search]?.organic ?? [];
      organic.forEach((doc, index) => {
        if (!doc?.url) {
          return;
        }

        const id = `${attachment.messageId}:${doc.url}`;
        if (map.has(id)) {
          return;
        }

        map.set(id, {
          id,
          toolCallId: attachment.toolCallId,
          messageId: attachment.messageId,
          rank: doc.rank ?? index + 1,
          url: doc.url,
          title: doc.title,
          snippet: doc.snippet,
          text: doc.text,
          score: doc.score,
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
  }, [attachments]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (results.length === 0) {
    return null;
  }

  const togglePinned = (result: WebResult) => {
    setOptionSettings((prev) => {
      const current = prev?.pinnedWebSources ?? [];
      const exists = current.some((source) => source.id === result.id);
      let next: TPinnedWebSource[];
      if (exists) {
        next = current.filter((source) => source.id !== result.id);
      } else {
        next = [
          ...current,
          {
            id: result.id,
            url: result.url,
            title: result.title,
            snippet: result.snippet,
            text: result.text,
            score: result.score ?? null,
            pinnedAt: new Date().toISOString(),
          },
        ];
      }
      return { ...(prev ?? {}), pinnedWebSources: next };
    });
  };

  const isPinned = (id: string) => pinnedSources.some((source) => source.id === id);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="mt-2 space-y-3">
      {results.map((result) => {
        const checked = isPinned(result.id);
        const favicon = getFavicon(result.url);
        const content = result.text ?? result.snippet ?? '';
        const displaySnippet = normalize(result.snippet);
        const displayContent = normalize(result.text);

        return (
          <div
            key={result.id}
            className={cn(
              'rounded-xl border border-border-light bg-surface-secondary p-4 text-sm shadow-sm transition-colors',
              checked && 'border-emerald-500/60',
            )}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {favicon && <img src={favicon} alt="" className="h-4 w-4" />}
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {result.title || result.url}
                  </a>
                </div>
                <div className="mt-1 break-all text-xs text-text-tertiary">{result.url}</div>
                {displaySnippet && (
                  <p className="mt-2 text-sm text-text-secondary">{displaySnippet}</p>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => togglePinned(result)}
                  aria-label={localize('com_ui_web_search_use_this')}
                />
                {localize('com_ui_web_search_use_this')}
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-text-tertiary">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                onClick={() => toggleExpanded(result.id)}
              >
                {expanded[result.id]
                  ? localize('com_ui_web_search_hide_content')
                  : localize('com_ui_web_search_show_content')}
              </Button>
              {typeof result.score === 'number' && (
                <span>{`Score: ${result.score.toFixed(3)}`}</span>
              )}
            </div>
            {expanded[result.id] && displayContent && (
              <div className="mt-3 rounded-lg bg-surface-primary p-3 text-sm leading-relaxed text-text-secondary shadow-inner">
                {displayContent}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
