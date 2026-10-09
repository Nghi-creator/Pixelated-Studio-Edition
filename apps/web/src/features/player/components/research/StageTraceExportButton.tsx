import { useState } from "react";
import { downloadBlob } from "../../downloadFile";
import type { BrowserStageTraceRecording } from "../../observability/browserStageTrace";
import { createStageTraceArchive } from "../../observability/stageTraceExport";

export function StageTraceExportButton({ recording }: { recording: BrowserStageTraceRecording | null }) {
  const [state, setState] = useState<"idle" | "exporting" | "saved" | "cancelled" | "failed">("idle");
  if (!recording) return null;
  async function exportTrace() {
    if (!recording || state === "exporting") return;
    setState("exporting");
    try {
      const blob = await createStageTraceArchive(recording, import.meta.env.VITE_N4_STAGE_TRACE_PRODUCER_VERSION, "producer_capture");
      const saved = await downloadBlob("pixelated-stage-trace.tar.gz", blob);
      setState(saved === "cancelled" ? "cancelled" : "saved");
    } catch { setState("failed"); }
  }
  return <div className="flex items-center gap-3 text-sm">
    <button type="button" disabled={state === "exporting"} onClick={() => { void exportTrace(); }} className="rounded border border-synth-border px-3 py-2">
      {state === "exporting" ? "Exporting trace…" : "Finish and export stage trace"}
    </button>
    <span role="status">{state === "saved" ? "Stage trace exported. Collection has stopped." : state === "cancelled" ? "Download cancelled. Collection has stopped." : state === "failed" ? "Stage trace export failed." : "Export ends stage trace collection."}</span>
  </div>;
}
