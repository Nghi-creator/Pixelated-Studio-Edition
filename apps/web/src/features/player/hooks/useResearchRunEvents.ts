import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  createResearchRunEvent,
  type ResearchRunEvent,
  type ResearchRunEventName,
} from "../research/researchRunEvents";

export function useResearchRunEvents({
  runId,
  sessionIdRef,
}: {
  runId: string;
  sessionIdRef: RefObject<string>;
}) {
  const runStartedAtRef = useRef<number | null>(null);
  const [events, setEvents] = useState<ResearchRunEvent[]>([]);

  useEffect(() => {
    if (runStartedAtRef.current === null) {
      runStartedAtRef.current = Date.now();
    }
  }, []);

  const recordEvent = useCallback(
    (name: ResearchRunEventName, details?: Record<string, unknown>) => {
      const nowMs = Date.now();
      const runStartedAt = runStartedAtRef.current ?? nowMs;
      setEvents((currentEvents) => [
        ...currentEvents,
        createResearchRunEvent({
          details,
          name,
          nowMs,
          runId,
          runStartedAt,
          sessionId: sessionIdRef.current,
        }),
      ]);
    },
    [runId, sessionIdRef],
  );

  const clearEvents = useCallback(() => {
    runStartedAtRef.current = Date.now();
    setEvents([]);
  }, []);

  return {
    clearEvents,
    events,
    recordEvent,
  };
}
