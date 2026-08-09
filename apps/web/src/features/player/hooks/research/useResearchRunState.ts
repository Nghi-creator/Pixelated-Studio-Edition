import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEmptyResearchBaselineForm,
  type ResearchBaselineForm,
} from "../../research/researchBaseline";
import {
  createResearchRunId,
  type ResearchRunMetadataForm,
} from "../../research/researchRunMetadata";
import { useResearchRunEvents } from "./useResearchRunEvents";

export function useResearchRunState({
  gameId,
  initialMetadataForm,
  playerMode,
  requestedRunId,
}: {
  gameId: string | undefined;
  initialMetadataForm?: ResearchRunMetadataForm;
  playerMode: "guest" | "host";
  requestedRunId?: string;
}) {
  const [runId] = useState(() => requestedRunId || createResearchRunId());
  const sessionIdRef = useRef("");
  const [metadataForm, setMetadataForm] = useState<ResearchRunMetadataForm>(
    () =>
      initialMetadataForm || {
        coldStart: false,
        networkType: "",
        notes: "",
        scenario: "localhost",
      },
  );
  const [baselineForm, setBaselineForm] = useState<ResearchBaselineForm>(() =>
    createEmptyResearchBaselineForm(),
  );
  const {
    clearEvents,
    events,
    recordEvent,
  } = useResearchRunEvents({
    runId,
    sessionIdRef,
  });

  useEffect(() => {
    if (!gameId) return;
    recordEvent("play_clicked", {
      gameId,
      playerMode,
    });
  }, [gameId, playerMode, recordEvent]);

  const setSessionId = useCallback((sessionId: string) => {
    sessionIdRef.current = sessionId;
  }, []);

  return {
    baselineForm,
    clearEvents,
    events,
    metadataForm,
    recordEvent,
    runId,
    setBaselineForm,
    setMetadataForm,
    setSessionId,
  };
}
