import { z } from "zod";

/**
 * Contract for Gemini JSON output. Backend validates shape only;
 * all numeric semantics originate from the model response.
 */
export const workloadItemSchema = z.object({
  label: z.string(),
  estimated_hours_per_week: z.number().optional(),
  complexity: z.enum(["low", "medium", "high"]).optional(),
  notes: z.string().optional(),
});

export const stressSimulationSchema = z.object({
  before: z.number(),
  after: z.number(),
  delta: z.number(),
});

export const overloadAnalysisSchema = z.object({
  risk_score: z.number().min(0).max(100),
  summary: z.string(),
  workload_breakdown: z.array(workloadItemSchema),
  conflicts: z.array(z.string()),
  actions: z.array(z.string()),
  stress_simulation: stressSimulationSchema,
  voice_script: z.string(),
});

export type OverloadAnalysis = z.infer<typeof overloadAnalysisSchema>;
export type WorkloadItem = z.infer<typeof workloadItemSchema>;
export type StressSimulation = z.infer<typeof stressSimulationSchema>;

export function parseOverloadAnalysis(raw: unknown): OverloadAnalysis {
  return overloadAnalysisSchema.parse(raw);
}
