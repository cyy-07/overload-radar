import type { OverloadAnalysis } from "@/services/ai/response.schema";
import { interpretRisk, type RiskPresentation } from "./riskEngine";
import { stressSimulationToSeries, type StressChartPoint } from "./simulationEngine";

export type DashboardPayload = {
  analysis: OverloadAnalysis;
  risk: RiskPresentation;
  stress_series: StressChartPoint[];
};

/**
 * Aggregates UI-ready views without changing semantic content from Gemini.
 */
export function toDashboardPayload(analysis: OverloadAnalysis): DashboardPayload {
  return {
    analysis,
    risk: interpretRisk(analysis),
    stress_series: stressSimulationToSeries(analysis.stress_simulation),
  };
}
