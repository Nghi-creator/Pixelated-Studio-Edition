import { createContext } from "react";

export type ResearchModeContextValue = {
  disableResearchMode: () => void;
  enableResearchMode: () => void;
  isResearchMode: boolean;
  setResearchMode: (enabled: boolean) => void;
  toggleResearchMode: () => void;
};

export const ResearchModeContext =
  createContext<ResearchModeContextValue | null>(null);

