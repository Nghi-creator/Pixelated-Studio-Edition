import { Skeleton } from "./Skeleton";

export function AdminTableSkeleton({
  columns,
  rows = 8,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-synth-border bg-[#2B1720] shadow-card">
      <div
        className="grid border-b border-synth-border bg-synth-bg p-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 w-24" />
        ))}
      </div>
      <div className="divide-y divide-synth-border/80">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-4 p-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={columnIndex === 0 ? "h-10 w-36" : "h-4 w-28"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminTablePageSkeleton({
  hasSearch = false,
  rows = 6,
}: {
  hasSearch?: boolean;
  rows?: number;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-9 w-64 max-w-[65vw]" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {hasSearch && <Skeleton className="h-10 w-72 rounded-lg" />}
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>
      </div>

      <AdminTableSkeleton columns={4} rows={rows} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function AdminReviewPageSkeleton({
  filterCount = 1,
}: {
  filterCount?: number;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-9 w-72 max-w-[65vw]" />
        </div>
        <Skeleton className="h-10 w-36 rounded-full" />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-synth-secondary/35 bg-[#2B1720] p-4 shadow-card xl:flex-row xl:items-center">
        {Array.from({ length: filterCount }, (_, index) => (
          <Skeleton
            className={index === 1 ? "h-10 w-56 rounded-lg" : "h-10 w-44 rounded-lg"}
            key={index}
          />
        ))}
        <Skeleton className="h-10 min-w-0 flex-1 rounded-lg" />
      </div>

      <section className="rounded-lg border border-synth-secondary/35 bg-[#2B1720] p-5 shadow-card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-4 w-36" />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>

        <div className="mt-5 grid items-stretch gap-4 xl:grid-cols-2">
          <div className="grid grid-rows-[44px_44px_44px_44px_44px] gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-11 rounded-lg" />
              <Skeleton className="h-11 rounded-lg" />
            </div>
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
          <div className="grid grid-rows-[44px_44px_44px_44px_44px] gap-3">
            <Skeleton className="row-span-2 h-full rounded-lg" />
            <Skeleton className="row-span-2 h-full rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Skeleton className="h-10 w-44 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ModerationQueueSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-11 w-11 rounded-lg" />
          <Skeleton className="h-10 w-80 max-w-[70vw]" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-44 rounded-lg" />
          <Skeleton className="h-12 w-28 rounded-full" />
        </div>
      </div>

      <section className="rounded-xl border border-synth-border bg-[#2B1720] p-6 shadow-card">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="w-full flex-1 space-y-7">
            <div>
              <Skeleton className="mb-3 h-4 w-24" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
            <div>
              <Skeleton className="mb-3 h-4 w-24" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
            <div className="flex flex-wrap gap-6 pt-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-12 w-36 rounded-lg" />
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-28" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-28 rounded-lg" />
          <Skeleton className="h-11 w-32 rounded-lg" />
          <Skeleton className="h-11 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

