import { AnalysisFindings } from "../finding.ts";

export function emptyFindings(): AnalysisFindings {
  return {
    warnings: [],
    errors: [],
    isErroneous: function () {
      return this.errors.length >= 1;
    },
  };
}

export function mergeFindings(
  a: AnalysisFindings,
  b: AnalysisFindings,
): AnalysisFindings {
  return {
    warnings: [...a.warnings, ...b.warnings],
    errors: [...a.errors, ...b.errors],
    isErroneous: a.isErroneous,
  };
}
