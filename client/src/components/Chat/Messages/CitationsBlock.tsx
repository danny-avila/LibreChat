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
  if (rawKey === 'ontario_combined' || rawKey.startsWith('ontario_') || rawKey.startsWith('ontario')) {
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

  if (!citations || citations.length === 0) {
    return null;
  }

  const parsedCitations = useMemo(() => {
    const pattern = /([a-zA-Z0-9_-]+)_page_(\d+)/;
    return citations.map((citation) => {
      const candidates = [citation.label, citation.url, citation.id].filter(Boolean) as string[];
      let match: RegExpMatchArray | null = null;
      for (const candidate of candidates) {
        match = candidate.match(pattern);
        if (match) break;
      }

      const key = match?.[1] ?? '';
      const page = match?.[2] ? parseInt(match[2], 10) : citation.page ?? null;
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

  return (
    <div
      className={cn(
        'mt-4 rounded-md border border-border-light bg-surface-primary-alt p-3 text-sm text-text-secondary dark:border-border-medium',
        className,
      )}
      role="note"
      aria-label="CodeCan Building Code citations"
    >
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-primary">
        Citations
      </h3>
      <ul className="space-y-3">
        {parsedCitations.map(({ id, section, snippet, parsed }) => {
          const { displayName, page, pdfUrl } = parsed;
          const showPdf = Boolean(pdfUrl);

          return (
            <li key={id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-text-primary">
                <span>{displayName}</span>
                {section ? <span className="text-xs text-text-secondary">({section})</span> : null}
                {page != null ? (
                  <span className="text-xs font-medium text-text-secondary">(p. {page})</span>
                ) : null}
                {showPdf ? (
                  <button
                    type="button"
                    onClick={() =>
                      setActivePdf({
                        url: pdfUrl,
                        page: page ?? 1,
                        label: displayName,
                      })
                    }
                    className="text-xs font-medium text-text-primary underline"
                  >
                    View PDF
                  </button>
                ) : null}
              </div>
              {snippet ? (
                <p className="text-xs leading-snug text-text-secondary">{snippet}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {activePdf ? (
        <div className="fixed inset-0 z-[9999] bg-black">
          <PdfViewer
            fileUrl={activePdf.url}
            initialPage={activePdf.page}
            onClose={() => setActivePdf(null)}
            className="h-full w-full"
          />
        </div>
      ) : null}
    </div>
  );
};

export default CitationsBlock;
