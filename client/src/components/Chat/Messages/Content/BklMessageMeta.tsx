import { useMemo } from 'react';
import { AtSign, Briefcase, Calendar, FileText, FileType, Sparkles } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { cn } from '~/utils';
import { useBklMattersQuery } from '~/data-provider/Matters/queries';

interface BklMeta {
  dateFrom?: string;
  dateTo?: string;
  extensionGroups?: string[];
  filterMatterUids?: string[];
  filterDocIds?: string[];
  filterDocLabels?: string[];
  referenceMatterUids?: string[];
  queryEnhanced?: boolean;
}

const parseBklMeta = (text: string | null | undefined): BklMeta | null => {
  if (!text) {
    return null;
  }

  const meta: BklMeta = {};
  let found = false;

  const filterMatch = text.match(/\[BKL_FILTER:(\{.*?\})\]/s);
  if (filterMatch) {
    try {
      const payload = JSON.parse(filterMatch[1]);
      if (payload.date_from) {
        meta.dateFrom = payload.date_from;
        found = true;
      }
      if (payload.date_to) {
        meta.dateTo = payload.date_to;
        found = true;
      }
      if (payload.extension_groups?.length) {
        meta.extensionGroups = payload.extension_groups;
        found = true;
      }
      if (payload.matter_uids) {
        meta.filterMatterUids = String(payload.matter_uids).split(',').filter(Boolean);
        found = meta.filterMatterUids.length > 0 || found;
      }
      if (payload.doc_ids) {
        meta.filterDocIds = String(payload.doc_ids).split(',').filter(Boolean);
        found = meta.filterDocIds.length > 0 || found;
      }
      if (payload.doc_labels) {
        meta.filterDocLabels = String(payload.doc_labels).split(',').filter(Boolean);
      }
    } catch {
      // Ignore malformed historical tags.
    }
  }

  const referenceMatch = text.match(/\[BKL_REFERENCE:(\{.*?\})\]/s);
  if (referenceMatch) {
    try {
      const payload = JSON.parse(referenceMatch[1]);
      if (payload.matter_uids) {
        meta.referenceMatterUids = String(payload.matter_uids).split(',').filter(Boolean);
        found = meta.referenceMatterUids.length > 0 || found;
      }
    } catch {
      // Ignore malformed historical tags.
    }
  }

  if (/\[BKL_QUERY_ENHANCE:on\]/.test(text)) {
    meta.queryEnhanced = true;
    found = true;
  }

  return found ? meta : null;
};

function Chip({
  icon,
  label,
  className = '',
}: {
  icon: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border-light',
        'bg-surface-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary',
        className,
      )}
    >
      {icon}
      <span className="max-w-[180px] truncate">{label}</span>
    </span>
  );
}

export default function BklMessageMeta({ message }: { message?: TMessage }) {
  const { data: mattersData } = useBklMattersQuery();

  const meta = useMemo(() => parseBklMeta(message?.text ?? ''), [message?.text]);

  const resolveMatterLabels = (uids?: string[]) => {
    if (!uids?.length) {
      return '';
    }
    if (!mattersData?.matters) {
      return uids.join(', ');
    }

    const mattersByUid = new Map(mattersData.matters.map((matter) => [matter.matter_uid, matter]));
    return uids
      .map((uid) => {
        const matter = mattersByUid.get(uid);
        return matter?.case_number || matter?.case_alias || matter?.matter_uid || uid;
      })
      .join(', ');
  };

  if (!meta) {
    return null;
  }

  const chips: ReactNode[] = [];

  if (meta.dateFrom || meta.dateTo) {
    const label = [meta.dateFrom?.slice(0, 10), meta.dateTo?.slice(0, 10)]
      .filter(Boolean)
      .join(' ~ ');
    chips.push(
      <Chip
        key="date"
        icon={<Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />}
        label={`기간: ${label}`}
      />,
    );
  }

  if (meta.extensionGroups?.length) {
    chips.push(
      <Chip
        key="ext"
        icon={<FileType className="h-3 w-3 shrink-0" aria-hidden="true" />}
        label={`확장자: ${meta.extensionGroups.join(', ')}`}
      />,
    );
  }

  if (meta.filterMatterUids?.length) {
    chips.push(
      <Chip
        key="filter-matter"
        icon={<Briefcase className="h-3 w-3 shrink-0 text-blue-500" aria-hidden="true" />}
        label={`사건: ${resolveMatterLabels(meta.filterMatterUids)}`}
        className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
      />,
    );
  }

  if (meta.filterDocIds?.length) {
    const docDisplayNames =
      meta.filterDocLabels && meta.filterDocLabels.length === meta.filterDocIds.length
        ? meta.filterDocLabels
        : meta.filterDocIds;
    chips.push(
      <Chip
        key="filter-docs"
        icon={<FileText className="h-3 w-3 shrink-0 text-purple-500" aria-hidden="true" />}
        label={`문서: ${docDisplayNames.join(', ')}`}
        className="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300"
      />,
    );
  }

  if (meta.referenceMatterUids?.length) {
    chips.push(
      <Chip
        key="ref-matter"
        icon={<AtSign className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden="true" />}
        label={`참조: ${resolveMatterLabels(meta.referenceMatterUids)}`}
      />,
    );
  }

  if (meta.queryEnhanced) {
    chips.push(
      <Chip
        key="qe"
        icon={<Sparkles className="h-3 w-3 shrink-0 text-blue-500" aria-hidden="true" />}
        label="쿼리 강화"
        className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
      />,
    );
  }

  if (!chips.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="적용된 설정">
      {chips}
    </div>
  );
}
