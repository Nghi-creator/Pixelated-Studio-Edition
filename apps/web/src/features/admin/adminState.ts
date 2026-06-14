export type AdminTargetRoleFilter = "all" | "users" | "admins";

export function getAdminApiErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "payload" in error &&
    typeof error.payload === "object" &&
    error.payload &&
    "error" in error.payload &&
    typeof error.payload.error === "string"
  ) {
    return error.payload.error;
  }

  return error instanceof Error ? error.message : fallback;
}

export function getPageAfterRemoval({
  currentPage,
  pageSize,
  totalAfterRemoval,
}: {
  currentPage: number;
  pageSize: number;
  totalAfterRemoval: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalAfterRemoval / pageSize));
  return Math.min(Math.max(1, currentPage), totalPages);
}

export function getPageRangeLabel({
  currentCount,
  page,
  pageSize,
  total,
}: {
  currentCount: number;
  page: number;
  pageSize: number;
  total: number;
}) {
  if (total <= 0 || currentCount <= 0) return "Showing 0-0 of 0";

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(start + currentCount - 1, total);
  return `Showing ${start}-${end} of ${total}`;
}
