import type { OverloadAnalysis } from "./response.schema";

/** Deterministic payload for demos when USE_MOCK_AI=true */
export const MOCK_OVERLOAD_ANALYSIS: OverloadAnalysis = {
  risk_score: 78,
  summary:
    "Current obligations exceed sustainable weekly cognitive bandwidth. Exam density and overlapping project peaks create a high probability of quality collapse unless scope is reduced within the next two weeks.",
  workload_breakdown: [
    { label: "Core lecture + readings", complexity: "medium", estimated_hours_per_week: 18 },
    { label: "Term project + milestones", complexity: "high", estimated_hours_per_week: 14 },
    { label: "Exam prep (two midterms)", complexity: "high", estimated_hours_per_week: 12 },
  ],
  conflicts: [
    "Project milestone overlaps with midterm week.",
    "Reading load assumes ideal conditions; no slack for illness or part-time work.",
  ],
  actions: [
    "Drop optional reading blocks; rely on summaries for two lowest-yield units.",
    "Negotiate one milestone slip of 4 days with course staff.",
    "Cancel non-credit workshops for two weeks before midterms.",
  ],
  stress_simulation: { before: 82, after: 54, delta: -28 },
  voice_script:
    "Overload Radar assessment complete. The trajectory shows elevated burnout risk driven by overlapping deadlines. Applying the recommended cuts reduces projected stress materially while preserving core grade outcomes.",
};
