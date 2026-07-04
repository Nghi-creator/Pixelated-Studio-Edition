const makePoints = (values: number[], width = 240, height = 54) => {
  if (values.length === 0) return "";

  const maximum = Math.max(...values, 1);
  const minimum = Math.min(...values, 0);
  const range = Math.max(maximum - minimum, 1);

  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = height - ((value - minimum) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

export function StreamTelemetryHistoryChart({
  label,
  primaryLabel,
  primaryValues,
  secondaryLabel,
  secondaryValues,
}: {
  label: string;
  primaryLabel: string;
  primaryValues: number[];
  secondaryLabel?: string;
  secondaryValues?: number[];
}) {
  return (
    <div className="rounded-md border border-synth-border bg-synth-bg/90 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase text-gray-500">
          {label}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-semibold text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-synth-action-hover" />
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-synth-secondary" />
              {secondaryLabel}
            </span>
          )}
        </div>
      </div>
      <svg
        aria-label={`${label} history`}
        className="h-14 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 240 54"
      >
        <path d="M0 18H240 M0 36H240" stroke="rgba(255,255,255,0.06)" />
        <polyline
          fill="none"
          points={makePoints(primaryValues)}
          stroke="#B00052"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        {secondaryValues && (
          <polyline
            fill="none"
            points={makePoints(secondaryValues)}
            stroke="#D8A4B5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        )}
      </svg>
    </div>
  );
}
