import { useMemo } from 'react';

interface TableOutputProps {
  data: Record<string, unknown>[];
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export default function TableOutput({ data }: TableOutputProps) {
  const columns = useMemo(() => Object.keys(data[0] ?? {}), [data]);

  if (columns.length === 0) {
    return null;
  }

  return (
    <div className="max-h-[300px] overflow-auto rounded-lg border border-border-light">
      <table className="w-full border-collapse text-xs" role="table">
        <thead className="sticky top-0 z-10 bg-surface-tertiary">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                scope="col"
                className="border-b border-border-light px-3 py-2 text-left font-medium text-text-secondary"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={rowIdx % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary'}
            >
              {columns.map((col) => (
                <td
                  key={col}
                  className="max-w-[200px] truncate border-b border-border-light px-3 py-1.5 text-text-primary"
                  title={formatCellValue(row[col])}
                >
                  {formatCellValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
