import type { ColumnDef } from '@tanstack/react-table';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type Spec = {
  name: string;
  method: string;
  path: string;
  domain: string;
};

/** Color-codes the HTTP verb the way API docs do, so the method reads at a glance. */
const METHOD_STYLES: Record<string, string> = {
  get: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  post: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  put: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  patch: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  delete: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function HeaderCell({ labelKey }: { labelKey: TranslationKeys }) {
  const localize = useLocalize();
  return <>{localize(labelKey)}</>;
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide',
        METHOD_STYLES[method.toLowerCase()] ?? 'bg-surface-secondary text-text-secondary',
      )}
    >
      {method}
    </span>
  );
}

export const columns: ColumnDef<Spec>[] = [
  {
    accessorKey: 'name',
    header: () => <HeaderCell labelKey="com_ui_name" />,
    cell: ({ row }) => <span className="font-medium text-text-primary">{row.original.name}</span>,
  },
  {
    accessorKey: 'method',
    header: () => <HeaderCell labelKey="com_ui_method" />,
    cell: ({ row }) => <MethodBadge method={row.original.method} />,
  },
  {
    accessorKey: 'path',
    header: () => <HeaderCell labelKey="com_ui_path" />,
    cell: ({ row }) => (
      <span className="break-all font-mono text-xs text-text-secondary">{row.original.path}</span>
    ),
  },
];
