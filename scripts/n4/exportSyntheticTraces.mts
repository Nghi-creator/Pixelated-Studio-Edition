// Fixed synthetic inputs for independent core fixtures; no browser capture claim.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserStageTraceRecording } from "../../apps/web/src/features/player/observability/browserStageTrace.ts";
import { createStageTraceArchive } from "../../apps/web/src/features/player/observability/stageTraceExport.ts";

const destination = process.argv[2];
if (!destination) throw new Error("Supply an existing output directory");
for (const supported of [true, false]) {
  const recording = new BrowserStageTraceRecording({ every_nth_frame: 1, max_frames: 2000, max_events: 10000 });
  const lifetime = recording.begin(0, supported)!;
  if (supported) lifetime.observe(14, 10, 1);
  const blob = await createStageTraceArchive(recording, "a".repeat(40), "synthetic");
  await writeFile(join(destination, `${supported ? "browser" : "browser-unavailable"}.tar.gz`), new Uint8Array(await blob.arrayBuffer()));
}
