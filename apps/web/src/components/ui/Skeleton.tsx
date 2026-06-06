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
      <Skeleton className="absolute inset-0 rounded-none" />
      <div className="absolute bottom-12 left-6 z-10 w-[min(540px,80vw)] space-y-4 md:left-16">
        <Skeleton className="h-8 w-3/4" />
        <SkeletonText lines={3} />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
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
    <div className="overflow-hidden rounded-xl border border-synth-border bg-synth-surface shadow-glow-card">
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

      <section className="rounded-xl border border-synth-border bg-synth-surface p-6 shadow-glow-card">
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
        <section className="rounded-2xl border border-synth-border bg-synth-surface p-6 shadow-glow-card md:p-8">
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

        <section className="rounded-2xl border border-synth-border bg-synth-surface p-6 shadow-glow-card md:p-8">
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
