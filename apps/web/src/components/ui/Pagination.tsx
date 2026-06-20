import { ChevronLeft, ChevronRight } from "lucide-react";
import { getVisiblePageNumbers } from "./paginationUtils";

interface PaginationProps {
  berryArrows?: boolean;
  currentPage: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  totalPages: number;
}

export function Pagination({
  berryArrows = false,
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
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1.5">
      <button
        aria-label="Previous page"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-gray-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${
          berryArrows
            ? "border-[#C02066] bg-[#9B0048] hover:bg-[#B00052]"
            : "border-synth-border bg-transparent hover:border-synth-secondary"
        }`}
        disabled={disabled || safeCurrentPage === 1}
        onClick={() => onPageChange(safeCurrentPage - 1)}
        title="Previous page"
        type="button"
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </button>

      {visiblePageNumbers.map((page, index) => {
        const previousPage = visiblePageNumbers[index - 1];
        const needsGap = previousPage && page - previousPage > 1;

        return (
          <span className="inline-flex items-center gap-1.5" key={page}>
            {needsGap && (
              <span aria-hidden="true" className="px-1 text-sm text-gray-600">
                ...
              </span>
            )}
            <button
              aria-current={page === safeCurrentPage ? "page" : undefined}
              aria-label={`Page ${page}`}
              className={`relative h-8 min-w-8 rounded-full px-2 text-sm font-bold transition-colors ${
                page === safeCurrentPage
                  ? "text-white after:absolute after:bottom-0.5 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-synth-secondary"
                  : "text-gray-500 hover:text-white"
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
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-gray-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35 ${
          berryArrows
            ? "border-[#C02066] bg-[#9B0048] hover:bg-[#B00052]"
            : "border-synth-border bg-transparent hover:border-synth-secondary"
        }`}
        disabled={disabled || safeCurrentPage === safeTotalPages}
        onClick={() => onPageChange(safeCurrentPage + 1)}
        title="Next page"
        type="button"
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </nav>
  );
}
