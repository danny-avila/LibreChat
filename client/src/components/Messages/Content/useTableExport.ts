import { useRef, useState, useCallback, useEffect } from 'react';
import copy from 'copy-to-clipboard';
import { triggerDownload } from '~/utils';

/** Escape a cell value for CSV (RFC 4180: quote when needed, double the quotes). */
const cellToCsv = (text: string): string => {
  if (/["",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

/** Flatten whitespace so a cell never breaks the TSV row/column structure. */
const cellToTsv = (text: string): string => text.replace(/[\t\r\n]+/g, ' ');

/** Read the rendered rows of a markdown table element into a 2D string array. */
export const extractTableRows = (table: HTMLElement | null): string[][] => {
  if (!table) {
    return [];
  }
  return Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll('th,td')).map((cell) => (cell.textContent ?? '').trim()),
  );
};

/**
 * Copy (TSV, for direct paste into spreadsheets) and download (CSV) actions
 * for rendered markdown tables, following the useCopyCode/useDownloadCode pattern.
 */
export default function useTableExport(tableRef: React.RefObject<HTMLTableElement | null>) {
  const [isCopied, setIsCopied] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const scheduleReset = useCallback((buttonRef: React.RefObject<HTMLButtonElement | null>) => {
    const wasFocused = document.activeElement === buttonRef.current;
    if (wasFocused) {
      requestAnimationFrame(() => buttonRef.current?.focus());
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsCopied(false);
      setIsDownloaded(false);
    }, 3000);
  }, []);

  const handleCopy = useCallback(() => {
    const rows = extractTableRows(tableRef.current);
    if (rows.length === 0) {
      return;
    }
    setIsCopied(true);
    copy(rows.map((row) => row.map(cellToTsv).join('\t')).join('\n'), { format: 'text/plain' });
    scheduleReset(copyButtonRef);
  }, [tableRef, scheduleReset]);

  const handleDownload = useCallback(() => {
    const rows = extractTableRows(tableRef.current);
    if (rows.length === 0) {
      return;
    }
    setIsDownloaded(true);
    const csv = rows.map((row) => row.map(cellToCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(URL.createObjectURL(blob), 'table.csv');
    scheduleReset(downloadButtonRef);
  }, [tableRef, scheduleReset]);

  return { isCopied, isDownloaded, copyButtonRef, downloadButtonRef, handleCopy, handleDownload };
}
