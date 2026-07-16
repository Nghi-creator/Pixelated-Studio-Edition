import type { IpcMainEvent } from "electron";
import type { DockerDiagnostic } from "../docker/diagnostics";
import { emitEngineState } from "../runtime/state";

export function emitDockerDiagnostic(
  event: IpcMainEvent,
  diagnostic: DockerDiagnostic,
) {
  emitEngineState(event, "FAILED", diagnostic.title);
  event.reply("docker-diagnostic", diagnostic);
  event.reply(
    "server-log",
    `<span class="text-red-500">ERROR: ${diagnostic.title}.</span>`,
  );
  if (diagnostic.detail) {
    event.reply("server-log", `Docker diagnostic: ${diagnostic.detail}`);
  }
  event.reply("engine-stopped");
}
