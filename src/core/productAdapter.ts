import type { OverloadAnalysis, WorkloadItem } from "@/services/ai/response.schema";

type Complexity = "low" | "medium" | "high";

function getRangeMultiplier(complexity: Complexity | undefined) {
  switch (complexity) {
    case "low":
      return { low: 0.85, high: 1.2, confidence: 0.82, variance: "narrow" };
    case "high":
      return { low: 0.7, high: 1.55, confidence: 0.58, variance: "wide" };
    case "medium":
    default:
      return { low: 0.78, high: 1.38, confidence: 0.7, variance: "medium" };
  }
}

function toModeledTask(item: WorkloadItem, index: number) {
  const hours = item.estimated_hours_per_week ?? 6;
  const profile = getRangeMultiplier(item.complexity);
  return {
    id: `task-${index + 1}`,
    label: item.label,
    low_hours: Number((hours * profile.low).toFixed(1)),
    high_hours: Number((hours * profile.high).toFixed(1)),
    confidence: profile.confidence,
    variance: profile.variance,
    complexity: item.complexity ?? "medium",
    note: item.notes ?? "Estimated from workload shape and constraint density.",
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function adaptAnalysisForProduct(analysis: OverloadAnalysis) {
  const stressBefore = clamp(analysis.stress_simulation.before);
  const stressAfter = clamp(analysis.stress_simulation.after);
  const modeledTasks = analysis.workload_breakdown.map(toModeledTask);

  const preserved = modeledTasks.slice(0, 2).map((task) => task.label);
  const delayed = analysis.actions.slice(0, 2);
  const removed = analysis.actions.slice(2, 4);

  const plans = {
    A: {
      label: "Plan A - Cut early",
      stress_score: stressAfter,
      feasibility_score: clamp(84 - Math.max(0, stressAfter - 40) * 0.25),
      summary: "Front-load scope reduction before the collision window hardens.",
      preserved,
      delayed,
      removed,
    },
    B: {
      label: "Plan B - Balanced",
      stress_score: clamp((stressBefore + stressAfter) / 2 + 8),
      feasibility_score: clamp(66 - Math.max(0, stressBefore - 55) * 0.18),
      summary: "Keep most obligations alive, but accept a tighter buffer and more context switching.",
      preserved,
      delayed,
      removed: removed.slice(0, 1),
    },
    C: {
      label: "Plan C - Last-minute survival",
      stress_score: clamp(stressBefore + 10),
      feasibility_score: clamp(48 - Math.max(0, stressBefore - 60) * 0.15),
      summary: "Protect only grade-critical outcomes and absorb a sharper stress spike.",
      preserved: preserved.slice(0, 1),
      delayed,
      removed: [...removed, "Nonessential recovery time"],
    },
  };

  return {
    risk_score: analysis.risk_score,
    summary: analysis.summary,
    cut_recommendations: analysis.actions,
    stress_before: stressBefore,
    stress_after: stressAfter,
    voice_script: analysis.voice_script,
    emergency_voice_script:
      "This is AI-generated comfort support. Pause, breathe, and protect the minimum viable version of your week. Cut one obligation now, keep only the grade-critical work, and do not treat overload like a discipline failure.",
    plans,
    differentiation_points: [
      "ChatGPT gives advice. Overload Radar simulates outcomes.",
      "Calendars track time. Overload Radar models overload under uncertainty.",
      "Productivity tools help you do more. Overload Radar helps you decide what to cut.",
    ],
    modeled_tasks: modeledTasks,
  };
}
