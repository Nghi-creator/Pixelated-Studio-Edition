export function getVisiblePageNumbers(currentPage: number, totalPages: number) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  return Array.from({ length: safeTotalPages }, (_, index) => index + 1).filter(
    (page) =>
      safeTotalPages <= 5 ||
      page === 1 ||
      page === safeTotalPages ||
      Math.abs(page - safeCurrentPage) <= 1,
  );
}

export function getPageSlice<T>(items: T[], currentPage: number, pageSize: number) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const pageStart = (safeCurrentPage - 1) * safePageSize;

  return {
    items: items.slice(pageStart, pageStart + safePageSize),
    pageStart,
    safeCurrentPage,
    totalPages,
  };
}
