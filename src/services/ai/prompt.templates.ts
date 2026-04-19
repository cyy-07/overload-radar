export type AcademicInputBundle = {
  workload_text?: string;
  syllabus: string;
  assignments: string;
  exam_samples: string;
  schedule?: string;
  life_events?: string;
  time_constraints?: string;
};

const SYSTEM_PREAMBLE = `You are the cognitive evaluation engine for OVERLOAD RADAR.
You are NOT a chatbot, tutor, or productivity coach.
You perform structured risk and workload reasoning over academic and life constraints.
Respond with a single JSON object matching the user's schema exactly. No markdown fences.`;

const OUTPUT_KEYS = `Required JSON keys:
- risk_score: number 0-100 (your overload index)
- summary: string (executive decision summary, <= 120 words)
- workload_breakdown: array of objects with at least { "label": string } per major obligation
- conflicts: string[] (schedule, deadline, or cognitive conflicts)
- actions: string[] (survival-oriented cuts, delays, or simplifications)
- stress_simulation: { "before": number, "after": number, "delta": number } on the same 0-100 stress scale
- voice_script: string (calm AI decision-support narration, no questions back to the user)`;

export function buildAnalysisPrompt(input: AcademicInputBundle): string {
  const constraints = input.time_constraints?.trim()
    ? `\nHard constraints:\n${input.time_constraints}`
    : "";
  const schedule = input.schedule?.trim() ? `\nSchedule:\n${input.schedule}` : "";
  const lifeEvents = input.life_events?.trim() ? `\nLife events:\n${input.life_events}` : "";
  const workloadText = input.workload_text?.trim()
    ? `\nRaw workload text:\n${input.workload_text}`
    : "";

  return `${SYSTEM_PREAMBLE}

${OUTPUT_KEYS}

Reasoning rules:
- Existing tools help students do more. You help them decide what to cut.
- Treat workload as uncertain, not fixed.
- Prioritize future stress trajectory and decision consequences.
- Preserve core academic outcomes when possible.

Syllabus:
${input.syllabus}

Assignments / deadlines / deliverables:
${input.assignments}

Exam samples / assessment style:
${input.exam_samples}${schedule}${lifeEvents}${constraints}${workloadText}`;
}
