import { Skeleton } from "./Skeleton";

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
      <div className="mb-8 space-y-3">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <Skeleton className="h-8 w-36" />
          <div className="grid w-full lg:max-w-3xl lg:grid-cols-3">
            <Skeleton className="h-10 w-full rounded-lg lg:col-span-2 lg:col-start-2" />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <Skeleton className="h-10 w-36 rounded-lg" />
          <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-3xl">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
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
