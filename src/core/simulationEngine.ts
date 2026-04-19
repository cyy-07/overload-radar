import type { StressSimulation } from "@/services/ai/response.schema";

export type StressChartPoint = { id: string; label: string; value: number };

/**
 * Chart-ready rows from model-supplied simulation only.
 */
export function stressSimulationToSeries(sim: StressSimulation): StressChartPoint[] {
  return [
    { id: "before", label: "Current trajectory", value: sim.before },
    { id: "after", label: "If cuts applied", value: sim.after },
  ];
}
