type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-synth-border/45 ${className}`}
    />
  );
}

export function SkeletonText({
  className = "",
  lines = 1,
}: SkeletonProps & { lines?: number }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={index === lines - 1 ? "h-3 w-2/3" : "h-3 w-full"}
        />
      ))}
    </div>
  );
}

export function GameGridSkeleton({ count = 15 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-synth-border bg-synth-surface"
        >
          <Skeleton className="h-64 rounded-none md:h-72" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="relative h-[360px] w-full overflow-hidden bg-synth-bg md:h-[440px]">
      <Skeleton className="absolute inset-0 rounded-none opacity-55" />
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-y-0 left-0 w-3/4 bg-gradient-to-r from-synth-bg via-synth-bg/80 to-transparent" />

      <Skeleton className="absolute left-4 top-1/2 h-14 w-14 -translate-y-1/2 rounded-full opacity-40" />
      <Skeleton className="absolute right-4 top-1/2 h-14 w-14 -translate-y-1/2 rounded-full opacity-40" />

      <div className="absolute left-0 top-1/2 z-10 w-full -translate-y-1/2">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <Skeleton className="mb-4 h-7 w-36 rounded-md" />
            <Skeleton className="mb-5 h-14 w-[min(34rem,75vw)] md:h-[4.5rem]" />
            <div className="flex flex-wrap gap-4">
              <Skeleton className="h-12 w-36 rounded-lg" />
              <Skeleton className="h-12 w-40 rounded-lg" />
            </div>
            <div className="mt-7 flex gap-2">
              <Skeleton className="h-1.5 w-8 rounded-full" />
              <Skeleton className="h-1.5 w-4 rounded-full" />
              <Skeleton className="h-1.5 w-4 rounded-full" />
              <Skeleton className="h-1.5 w-4 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GamesCatalogSkeleton() {
  return (
    <div className="w-full">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-10 w-full rounded-lg md:w-96" />
      </div>
      <GameGridSkeleton />
    </div>
  );
}

export function FavoritesPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto mt-8 w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <Skeleton className="mb-10 h-5 w-36" />
        <Skeleton className="mb-14 h-12 w-64 max-w-[70vw] md:h-14" />

        <div className="grid grid-cols-2 gap-6 opacity-60 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-xl border border-synth-border bg-synth-bg"
            >
              <Skeleton className="h-52 rounded-none md:h-60" />
              <div className="p-4">
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

export function ProfileSkeleton() {
  return (
    <div className="mx-auto mt-8 w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Skeleton className="mb-8 h-5 w-32" />
      <Skeleton className="mb-4 h-11 w-80 max-w-full" />

      <div className="space-y-8">
        <section className="rounded-2xl border border-synth-border bg-[#2B1720] p-6 shadow-card md:p-8">
          <Skeleton className="mb-10 h-7 w-40" />

          <div className="mb-10 flex justify-center">
            <Skeleton className="h-24 w-24 rounded-full" />
          </div>

          <div className="space-y-7">
            <div>
              <Skeleton className="mb-3 h-4 w-28" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
            <div>
              <Skeleton className="mb-3 h-4 w-24" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
            <Skeleton className="h-12 w-44 rounded-lg" />
          </div>
        </section>

        <section className="rounded-2xl border border-synth-border bg-[#2B1720] p-6 shadow-card md:p-8">
          <Skeleton className="mb-10 h-7 w-28" />

          <div className="space-y-7">
            <div>
              <Skeleton className="mb-3 h-4 w-36" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
            <div>
              <Skeleton className="mb-3 h-4 w-28" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
            <Skeleton className="h-12 w-56 rounded-lg" />
          </div>
        </section>
      </div>
    </div>
  );
}
