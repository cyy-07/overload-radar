import type { OverloadAnalysis } from "@/services/ai/response.schema";

export type RiskBand = "calm" | "elevated" | "critical";

export type RiskPresentation = {
  band: RiskBand;
  /** Display copy only; numeric source is always Gemini's risk_score */
  headline: string;
};

/**
 * Maps model-produced risk_score to UI bands. Does not compute load from raw inputs.
 */
export function interpretRisk(analysis: OverloadAnalysis): RiskPresentation {
  const s = analysis.risk_score;
  if (s < 40) {
    return { band: "calm", headline: "Load within tolerable band" };
  }
  if (s < 70) {
    return { band: "elevated", headline: "Overload building — cuts recommended" };
  }
  return { band: "critical", headline: "High failure / burnout risk — immediate scope reduction" };
}
