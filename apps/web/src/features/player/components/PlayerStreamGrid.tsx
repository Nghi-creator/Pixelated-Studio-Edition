import type { ReactNode } from "react";

export function PlayerStreamGrid({
  children,
  layoutClassName,
  showStreamTelemetry,
  telemetryPanel,
}: {
  children: ReactNode;
  layoutClassName: string;
  showStreamTelemetry: boolean;
  telemetryPanel: ReactNode;
}) {
  return (
    <div
      className={`grid w-full items-start gap-4 transition-[max-width,grid-template-columns] duration-300 ${
        showStreamTelemetry
          ? `${layoutClassName} xl:grid-cols-[minmax(0,1fr)_18rem]`
          : layoutClassName
      }`}
    >
      {children}
      {showStreamTelemetry && telemetryPanel}
    </div>
  );
}

export function PlayerRecordingStatusButton({
  csvStatusText,
  csvStatusTitle,
  isVisible,
  onOpen,
}: {
  csvStatusText: string;
  csvStatusTitle?: string;
  isVisible: boolean;
  onOpen: () => void;
}) {
  if (!isVisible) return null;

  return (
    <button
      className="rounded-full border border-synth-border bg-synth-surface px-3 py-1 text-xs font-semibold text-synth-secondary transition hover:bg-synth-elevated hover:text-white"
      onClick={onOpen}
      title={csvStatusTitle}
      type="button"
    >
      {csvStatusText}
    </button>
  );
}
