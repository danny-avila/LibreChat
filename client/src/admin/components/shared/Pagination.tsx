import type * as t from '~/admin/types';
import { Pagination as CUIPagination } from '~/admin/ui';

export function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [1];
  const windowStart = Math.max(2, current - 1);
  const windowEnd = Math.min(total - 1, current + 1);
  if (windowStart > 2) pages.push('ellipsis');
  for (let i = windowStart; i <= windowEnd; i++) pages.push(i);
  if (windowEnd < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export function Pagination({ currentPage, totalPages, onPageChange }: t.PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <CUIPagination currentPage={currentPage} totalPages={totalPages} onChange={onPageChange} />
  );
}
