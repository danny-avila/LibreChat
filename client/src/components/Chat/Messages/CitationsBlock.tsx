/* eslint-disable i18next/no-literal-string */
import React, { useMemo, useState } from 'react';
import type { TCitation } from 'librechat-data-provider';
import { cn } from '~/utils';
import PdfViewer from '~/components/Pdf/PdfViewer';
import pdfMap from '~/data/pdfs.json';

type PdfMeta = {
  displayName: string;
  pdfPath: string;
};

const assetBasePath = (import.meta.env.VITE_CLIENT_BASE_PATH ?? '').trim().replace(/\/$/, '');
const resolvePdfPath = (pdfPath: string) => {
  if (!pdfPath) {
    return '';
  }
  if (/^https?:\/\//i.test(pdfPath)) {
    return pdfPath;
  }
  return `${assetBasePath}${pdfPath.startsWith('/') ? '' : '/'}${pdfPath}`;
};

const resolvePdfMeta = (rawKey: string): PdfMeta | undefined => {
  if (!rawKey) {
    return undefined;
  }
  const map = pdfMap as Record<string, PdfMeta>;
  if (map[rawKey]) {
    return map[rawKey];
  }
  if (
    rawKey === 'ontario_combined' ||
    rawKey.startsWith('ontario_') ||
    rawKey.startsWith('ontario')
  ) {
    return map.ontario;
  }
  return undefined;
};

type CitationsBlockProps = {
  citations?: TCitation[];
  className?: string;
};

const CitationsBlock: React.FC<CitationsBlockProps> = ({ citations, className }) => {
  const [activePdf, setActivePdf] = useState<{ url: string; page: number; label: string } | null>(
    null,
  );

  const parsedCitations = useMemo(() => {
    if (!citations || citations.length === 0) return [];
    const pattern = /([a-zA-Z0-9_-]+)_page_(\d+)/;
    return citations.map((citation) => {
      const candidates = [citation.label, citation.url, citation.id].filter(Boolean) as string[];
      let match: RegExpMatchArray | null = null;
      for (const candidate of candidates) {
        match = candidate.match(pattern);
        if (match) break;
      }

      const key = match?.[1] ?? '';
      const page = match?.[2] ? parseInt(match[2], 10) : (citation.page ?? null);
      const meta = resolvePdfMeta(key);

      const displayName =
        meta?.displayName ?? citation.label ?? citation.id ?? citation.url ?? 'Citation';

      return {
        ...citation,
        parsed: {
          key,
          page,
          meta,
          displayName,
          pdfUrl: meta?.pdfPath ? resolvePdfPath(meta.pdfPath) : '',
        },
      };
    });
  }, [citations]);

  if (parsedCitations.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'mt-4 overflow-hidden rounded-[14px] border border-[rgba(11,47,91,0.08)] bg-white dark:border-white/[0.08] dark:bg-dm-surface',
        className,
      )}
      role="note"
      aria-label="CodeCan Building Code citations"
    >
      <div className="flex items-center justify-between border-b border-[rgba(11,47,91,0.06)] px-4 pb-2 pt-3 dark:border-white/[0.08]">
        {}
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cc-slate-500 dark:text-dm-text-mute">
          Citations
        </span>
        <span className="font-mono text-[11px] font-semibold text-cc-slate-400 dark:text-dm-text-faint">
          {parsedCitations.length}
        </span>
      </div>
      <ul className="m-0 list-none p-0">
        {parsedCitations.map(({ id, section, parsed }, i) => {
          const { displayName, page, pdfUrl } = parsed;
          const showPdf = Boolean(pdfUrl);
          const handleOpen = () => {
            if (!showPdf) return;
            let pageNumber: number;
            if (typeof page === 'number') {
              pageNumber = page;
            } else if (page) {
              pageNumber = Number(page);
            } else {
              pageNumber = 1;
            }
            setActivePdf({
              url: pdfUrl,
              page: Number.isFinite(pageNumber) ? pageNumber : 1,
              label: displayName,
            });
          };

          return (
            <li
              key={id}
              className={cn(
                'flex items-stretch',
                i < parsedCitations.length - 1 &&
                  'border-b border-[rgba(11,47,91,0.05)] dark:border-white/[0.08]',
              )}
            >
              <button
                type="button"
                onClick={handleOpen}
                disabled={!showPdf}
                className={cn(
                  'flex w-full items-center gap-3 bg-transparent px-4 py-3 text-left',
                  showPdf && 'cursor-pointer',
                )}
              >
                <span className="min-h-[20px] w-[3px] flex-none self-stretch rounded-[2px] bg-signal-amber" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.005em] text-ink-800 dark:text-dm-text">
                  {displayName}
                  {section ? (
                    <span className="ml-1 text-[12px] font-normal text-cc-slate-500 dark:text-dm-text-mute">
                      ({section})
                    </span>
                  ) : null}
                </span>
                {page != null ? (
                  <span className="flex-none font-mono text-[11px] text-cc-slate-500 dark:text-dm-text-mute">
                    {}
                    p. {page}
                  </span>
                ) : null}
                {showPdf ? (
                  <span className="inline-flex flex-none items-center gap-1 text-[12px] font-bold tracking-[0.02em] text-ink-800 dark:text-signal-amber">
                    {}
                    View PDF
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M7 17L17 7M9 7h8v8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {activePdf ? (
        <PdfViewer
          fileUrl={activePdf.url}
          initialPage={activePdf.page}
          title={activePdf.label}
          onClose={() => setActivePdf(null)}
        />
      ) : null}
    </div>
  );
};

export default CitationsBlock;
