import { AnalysisFindings } from "../analysis.ts";

export function emptyFindings(): AnalysisFindings {
  return {
    warnings: [],
    errors: [],
  };
}

export function mergeFindings(
  a: AnalysisFindings,
  b: AnalysisFindings,
): AnalysisFindings {
  return {
    warnings: [...a.warnings, ...b.warnings],
    errors: [...a.errors, ...b.errors],
  };
}
