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

/**
 * Color-codes the HTTP verb the way API docs do, so the method reads at a
 * glance. The hue comes from the categorical series ramp (identity rather than
 * status) and rides on a leading dot, because the series slots are contracted
 * as marks at 3:1 and the verb itself is small text that needs 4.5:1, so the
 * label stays on `text-secondary`. `delete` takes the error role, because
 * destructive really is a status.
 */
const METHOD_DOTS: Record<string, string> = {
  get: 'bg-series-1',
  post: 'bg-series-7',
  put: 'bg-series-4',
  patch: 'bg-series-6',
  delete: 'bg-status-error',
};

function HeaderCell({ labelKey }: { labelKey: TranslationKeys }) {
  const localize = useLocalize();
  return <>{localize(labelKey)}</>;
}

function MethodBadge({ method }: { method: string }) {
  const dot = METHOD_DOTS[method.toLowerCase()];
  return (
    <span className="text-text-secondary inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wide uppercase">
      {dot != null && (
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', dot)} />
      )}
      {method}
    </span>
  );
}

export const columns: ColumnDef<Spec>[] = [
  {
    accessorKey: 'name',
    header: () => <HeaderCell labelKey="com_ui_name" />,
    cell: ({ row }) => <span className="text-text-primary font-medium">{row.original.name}</span>,
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
      <span className="text-text-secondary font-mono text-xs break-all">{row.original.path}</span>
    ),
  },
];
