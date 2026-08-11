import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import {
  isResearchRoute,
  readResearchMode,
  writeResearchMode,
} from "./researchModeStorage";
import {
  ResearchModeContext,
  type ResearchModeContextValue,
} from "./researchModeContext";

export function ResearchModeProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [storedResearchMode, setResearchModeState] = useState(() =>
    readResearchMode(
      typeof window === "undefined" ? null : window.sessionStorage,
      typeof window === "undefined" ? "" : window.location.pathname,
    ),
  );
  const isResearchMode =
    storedResearchMode || isResearchRoute(location.pathname);

  useEffect(() => {
    writeResearchMode(
      typeof window === "undefined" ? null : window.sessionStorage,
      isResearchMode,
    );
  }, [isResearchMode]);

  const value = useMemo<ResearchModeContextValue>(
    () => ({
      disableResearchMode: () => setResearchModeState(false),
      enableResearchMode: () => setResearchModeState(true),
      isResearchMode,
      setResearchMode: setResearchModeState,
      toggleResearchMode: () =>
        setResearchModeState((current) => !current),
    }),
    [isResearchMode],
  );

  return (
    <ResearchModeContext.Provider value={value}>
      {children}
    </ResearchModeContext.Provider>
  );
}
