import React, { useMemo, useState } from 'react';
import {
  Table,
  Input,
  Button,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableHeader,
  OGDialog,
  OGDialogTrigger,
  OGDialogContent,
  OGDialogTitle,
  OGDialogClose,
} from '@librechat/client';
import { Eye, X } from 'lucide-react';
import { useLocalize } from '~/hooks';
import type { ExtractedArtifact } from '~/utils/extractArtifacts';
import { CodeMarkdown } from '~/components/Artifacts/Code';

type ArtifactsTableProps = {
  artifacts: ExtractedArtifact[];
};

const pageSize = 10;

export function ArtifactsTable({ artifacts }: ArtifactsTableProps) {
  const localize = useLocalize();
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return artifacts.filter((a) =>
      [a.title, a.type].some((v) => (v || '').toLowerCase().includes(query)),
    );
  }, [artifacts, searchQuery]);

  const currentRows = useMemo(() => {
    return filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  }, [filtered, pageIndex]);

  // language is computed upstream in extractArtifacts.ts and exposed on each artifact

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-4">
        <Input
          placeholder="Filter artifacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Filter artifacts"
        />
      </div>

      <div className="rounded-lg border border-border-light bg-transparent shadow-sm transition-colors">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="border-b border-border-light">
              <TableHead className="w-[45%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                <div>Title</div>
              </TableHead>
              <TableHead className="w-[25%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                <div>Type</div>
              </TableHead>
              <TableHead className="w-[30%] bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary">
                <div>Preview</div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentRows.length ? (
              currentRows.map((artifact) => (
                <TableRow
                  key={artifact.id}
                  className="border-b border-border-light hover:bg-surface-secondary"
                >
                  <TableCell className="w-[45%] px-4 py-3">
                    <div
                      className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-primary"
                      title={artifact.title}
                    >
                      {artifact.title}
                    </div>
                  </TableCell>
                  <TableCell className="w-[25%] px-4 py-3">
                    <div
                      className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-secondary"
                      title={artifact.type}
                    >
                      {artifact.type}
                    </div>
                  </TableCell>
                  <TableCell className="w-[30%] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <OGDialog
                        open={openId === artifact.id}
                        onOpenChange={(o) => setOpenId(o ? artifact.id : null)}
                      >
                        <OGDialogTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label={localize('com_ui_preview')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </OGDialogTrigger>
                        <OGDialogContent className="flex max-h-[80vh] max-w-full flex-col overflow-hidden rounded-lg bg-surface-primary p-0 md:max-w-[800px]">
                          <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
                            <OGDialogTitle className="text-base font-medium">
                              {artifact.title}
                            </OGDialogTitle>
                            <OGDialogClose asChild>
                              <button aria-label="Close" className="text-text-secondary">
                                <X className="h-4 w-4" />
                              </button>
                            </OGDialogClose>
                          </div>
                          <div className="max-h-[70vh] overflow-auto p-4">
                            {(() => {
                              const lang = artifact.language ?? '';
                              const fenced = `\n\n\`\`\`${lang}\n${artifact.content ?? ''}\n\`\`\`\n`;
                              return <CodeMarkdown content={fenced} isSubmitting={false} />;
                            })()}
                          </div>
                        </OGDialogContent>
                      </OGDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-sm text-text-secondary">
                  {localize('com_files_no_results')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > pageSize && (
        <div
          className="flex items-center justify-end gap-2"
          role="navigation"
          aria-label="Pagination"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
            disabled={pageIndex === 0}
            aria-label={localize('com_ui_prev')}
          >
            {localize('com_ui_prev')}
          </Button>
          <div
            className="text-sm"
            aria-live="polite"
          >{`${pageIndex + 1} / ${Math.ceil(filtered.length / pageSize)}`}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPageIndex((prev) => ((prev + 1) * pageSize < filtered.length ? prev + 1 : prev))
            }
            disabled={(pageIndex + 1) * pageSize >= filtered.length}
            aria-label={localize('com_ui_next')}
          >
            {localize('com_ui_next')}
          </Button>
        </div>
      )}
    </div>
  );
}

export default ArtifactsTable;
