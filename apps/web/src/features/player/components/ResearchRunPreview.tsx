import { RESEARCH_RUN_SCHEMA_VERSION } from "../researchRunMetadata";
import type { ResearchRunSummary } from "../researchRunSummary";

function formatMs(value: number | null) {
  return value === null ? "--" : `${value} ms`;
}

function formatValue(value: number | null) {
  return value === null ? "--" : value;
}

export function ResearchRunPreview({
  eventCount,
  firstFrameElapsedMs,
  playerMode,
  pythonReadyElapsedMs,
  recordedSampleCount,
  sessionId,
  startGameElapsedMs,
  streamProfileId,
  summary,
}: {
  eventCount: number;
  firstFrameElapsedMs: number | null;
  playerMode: "guest" | "host";
  pythonReadyElapsedMs: number | null;
  recordedSampleCount: number;
  sessionId: string;
  startGameElapsedMs: number | null;
  streamProfileId: string;
  summary: ResearchRunSummary;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border border-synth-border bg-synth-bg/80 p-3 text-xs">
      <div>
        <div className="font-semibold uppercase text-gray-500">Schema</div>
        <div className="mt-1 font-bold text-white">
          {RESEARCH_RUN_SCHEMA_VERSION}
        </div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">Mode</div>
        <div className="mt-1 font-bold capitalize text-white">
          {playerMode}
        </div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">Session</div>
        <div className="mt-1 truncate font-bold text-white">{sessionId}</div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">Profile</div>
        <div className="mt-1 truncate font-bold text-white">
          {streamProfileId}
        </div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">Events</div>
        <div className="mt-1 font-bold text-white">{eventCount}</div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">Samples</div>
        <div className="mt-1 font-bold text-white">{recordedSampleCount}</div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">
          First frame
        </div>
        <div className="mt-1 font-bold text-white">
          {formatMs(firstFrameElapsedMs)}
        </div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">Start game</div>
        <div className="mt-1 font-bold text-white">
          {formatMs(startGameElapsedMs)}
        </div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">
          Python ready
        </div>
        <div className="mt-1 font-bold text-white">
          {formatMs(pythonReadyElapsedMs)}
        </div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">Median FPS</div>
        <div className="mt-1 font-bold text-white">
          {formatValue(summary.metrics.fps.median)}
        </div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">P95 jitter</div>
        <div className="mt-1 font-bold text-white">
          {summary.metrics.jitterMs.p95 === null
            ? "--"
            : `${summary.metrics.jitterMs.p95} ms`}
        </div>
      </div>
      <div>
        <div className="font-semibold uppercase text-gray-500">Loss/min</div>
        <div className="mt-1 font-bold text-white">
          {formatValue(summary.packetLoss.lossPerMinute)}
        </div>
      </div>
    </div>
  );
}
