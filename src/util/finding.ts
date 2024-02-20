import { AnalysisFindings } from "../analysis.ts";

export function emptyFindings(): AnalysisFindings {
  return {
    warnings: [],
    errors: [],
  };
}
