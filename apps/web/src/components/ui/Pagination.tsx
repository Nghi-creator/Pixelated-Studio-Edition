import { ChevronLeft, ChevronRight } from "lucide-react";
import { getVisiblePageNumbers } from "./paginationUtils";

interface PaginationProps {
  currentPage: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  totalPages: number;
}

export function Pagination({
  currentPage,
  disabled = false,
  onPageChange,
  totalPages,
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const visiblePageNumbers = getVisiblePageNumbers(
    safeCurrentPage,
    safeTotalPages,
  );

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-2">
      <button
        aria-label="Previous page"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-synth-border bg-synth-surface text-gray-300 transition-colors hover:border-synth-primary/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled || safeCurrentPage === 1}
        onClick={() => onPageChange(safeCurrentPage - 1)}
        title="Previous page"
        type="button"
      >
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </button>

      {visiblePageNumbers.map((page, index) => {
        const previousPage = visiblePageNumbers[index - 1];
        const needsGap = previousPage && page - previousPage > 1;

        return (
          <span className="inline-flex items-center gap-2" key={page}>
            {needsGap && (
              <span aria-hidden="true" className="px-1 text-sm text-gray-600">
                ...
              </span>
            )}
            <button
              aria-current={page === safeCurrentPage ? "page" : undefined}
              aria-label={`Page ${page}`}
              className={`h-10 min-w-10 rounded-lg border px-3 text-sm font-bold transition-colors ${
                page === safeCurrentPage
                  ? "border-synth-primary bg-synth-primary/15 text-white"
                  : "border-synth-border bg-synth-surface text-gray-400 hover:border-synth-primary/70 hover:text-white"
              }`}
              disabled={disabled}
              onClick={() => onPageChange(page)}
              type="button"
            >
              {page}
            </button>
          </span>
        );
      })}

      <button
        aria-label="Next page"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-synth-border bg-synth-surface text-gray-300 transition-colors hover:border-synth-primary/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled || safeCurrentPage === safeTotalPages}
        onClick={() => onPageChange(safeCurrentPage + 1)}
        title="Next page"
        type="button"
      >
        <ChevronRight aria-hidden="true" className="h-5 w-5" />
      </button>
    </nav>
  );
}
