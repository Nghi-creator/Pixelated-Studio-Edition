import { useContext } from "react";
import { ResearchModeContext } from "./researchModeContext";

export function useResearchMode() {
  const context = useContext(ResearchModeContext);
  if (!context) {
    throw new Error("useResearchMode must be used within ResearchModeProvider.");
  }
  return context;
}

