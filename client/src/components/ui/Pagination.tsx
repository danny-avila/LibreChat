import React, { useEffect, useCallback } from "react";
import { Button } from "~/components/ui/Button";
import { cn } from "~/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ---------------------------
// Pagination Component
// ---------------------------
interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
}

const PaginationRoot: React.FC<PaginationProps> = ({
  page,
  limit,
  total,
  onPageChange,
  siblingCount = 1,
}) => {
  const totalPages = Math.ceil(total / limit);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const totalNumbers = siblingCount * 2 + 5;

    if (totalPages <= totalNumbers) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      const leftSibling = Math.max(page - siblingCount, 1);
      const rightSibling = Math.min(page + siblingCount, totalPages);
      const showLeftDots = leftSibling > 2;
      const showRightDots = rightSibling < totalPages - 1;

      if (!showLeftDots && showRightDots) {
        const leftItems = 3 + 2 * siblingCount;
        for (let i = 1; i <= leftItems; i++) pages.push(i);
        pages.push("…", totalPages);
      } else if (showLeftDots && !showRightDots) {
        pages.push(1, "…");
        const rightItems = 3 + 2 * siblingCount;
        for (let i = totalPages - rightItems + 1; i <= totalPages; i++) pages.push(i);
      } else if (showLeftDots && showRightDots) {
        pages.push(1, "…");
        for (let i = leftSibling; i <= rightSibling; i++) pages.push(i);
        pages.push("…", totalPages);
      }
    }
    return pages;
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && page < totalPages) {
        onPageChange(page + 1);
      } else if (e.key === "ArrowLeft" && page > 1) {
        onPageChange(page - 1);
      }
    },
    [page, totalPages, onPageChange]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-md bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Left: empty space for balance */}
      <div className="flex-1"></div>
      {/* Center: pagination controls */}
      <div className="flex justify-center">
        <PaginationContent>
          <PaginationPrevious page={page} onPageChange={onPageChange} disabled={page === 1} />
          {getPageNumbers().map((p, idx) =>
            p === "…" ? (
              <PaginationEllipsis key={idx} />
            ) : (
              <PaginationItem key={idx}>
                <PaginationLink active={page === p} onClick={() => onPageChange(p as number)}>
                  {p}
                </PaginationLink>
              </PaginationItem>
            )
          )}
          <PaginationNext page={page} totalPages={totalPages} onPageChange={onPageChange} disabled={page === totalPages} />
        </PaginationContent>
      </div>
      {/* Right: showing info */}
      <div className="flex-1 flex justify-end">
        <div className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
          {total > 0 ? `Showing ${(page - 1) * limit + 1}-${Math.min(page * limit, total)} of ${total}` : "No data"}
        </div>
      </div>
    </div>
  );
};

// ---------------------------
// Sub-components
// ---------------------------
const PaginationContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-1" role="navigation">
    {children}
  </div>
);

const PaginationItem: React.FC<{ children: React.ReactNode }> = ({ children }) => <div>{children}</div>;

const PaginationLink: React.FC<{
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}> = ({ children, active, onClick }) => (
  <Button
    variant={active ? "default" : "outline"}
    size="sm"
    onClick={onClick}
    className={cn(
      "min-w-[36px] text-black dark:text-white",
      active
        ? "bg-gray-200 dark:bg-gray-700 font-medium hover:bg-gray-300 dark:hover:bg-gray-300"
        : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-300"
    )}
    aria-label={`Page ${children}`}
  >
    {children}
  </Button>
);

const PaginationPrevious: React.FC<{
  page: number;
  onPageChange: (page: number) => void;
  disabled: boolean;
}> = ({ page, onPageChange, disabled }) => (
  <Button
    variant="outline"
    size="sm"
    onClick={() => onPageChange(page - 1)}
    disabled={disabled}
    className="text-black dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md w-10 h-10 p-0 flex items-center justify-center"
    aria-label="Previous Page"
  >
    <ChevronLeft className="h-4 w-4" />
  </Button>
);

const PaginationNext: React.FC<{
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled: boolean;
}> = ({ page, totalPages, onPageChange, disabled }) => (
  <Button
    variant="outline"
    size="sm"
    onClick={() => onPageChange(page + 1)}
    disabled={disabled}
    className="text-black dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md w-10 h-10 p-0 flex items-center justify-center"
    aria-label="Next Page"
  >
    <ChevronRight className="h-4 w-4" />
  </Button>
);

const PaginationEllipsis: React.FC = () => (
  <span className="px-2 text-gray-400 dark:text-gray-500 select-none">…</span>
);

// ---------------------------
// Exports
// ---------------------------
export {
  PaginationRoot as Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};