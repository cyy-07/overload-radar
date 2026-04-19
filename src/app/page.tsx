"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";

type PlanCard = {
  label: string;
  stress_score: number;
  feasibility_score: number;
  summary: string;
  preserved: string[];
  delayed: string[];
  removed: string[];
};

type AnalyzeResponse = {
  risk_score: number;
  summary: string;
  cut_recommendations: string[];
  stress_before: number;
  stress_after: number;
  voice_script: string;
  emergency_voice_script?: string;
  used_mock?: boolean;
  mock_reason?: string | null;
  plans: Record<"A" | "B" | "C", PlanCard>;
};

type WhatIfDraft = {
  eventName: string;
  time: string;
  duration: string;
  priority: "Low" | "Medium" | "High";
  note: string;
};

type ScenarioPlan = {
  key: "A" | "B" | "C";
  label: string;
  subtitle: string;
  tag: string;
  tagClass: "tag-low" | "tag-mid" | "tag-high";
  stress: number;
  feasibility: number;
  changes: string;
  impact: string;
  tradeoff: string;
  cuts: string[];
  curve: number[];
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEK_AXIS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const HOUR_LABELS = HOURS.map((hour) => `${hour.toString().padStart(2, "0")}:00`);
const FIELDS = [
  { key: "courses", label: "Courses" },
  { key: "assignments", label: "Assignments" },
  { key: "exams", label: "Exams" },
  { key: "schedule", label: "Schedule" },
  { key: "lifeEvents", label: "Life events" },
] as const;

type ToggleKey = (typeof FIELDS)[number]["key"];
type PlannerState = Record<(typeof DAYS)[number], string[]>;

function createEmptyPlanner(): PlannerState {
  return {
    Mon: Array(24).fill(""),
    Tue: Array(24).fill(""),
    Wed: Array(24).fill(""),
    Thu: Array(24).fill(""),
    Fri: Array(24).fill(""),
    Sat: Array(24).fill(""),
    Sun: Array(24).fill(""),
  };
}

const DEMO_STATE = {
  workloadText:
    "CHE 160A, EE 132, CS 228, discussion sections, part-time student assistant shifts, and lab-heavy weekdays with thin recovery windows.",
  courses: `CHE 160A-001 Chemical and Environmental Engineering Laboratory
TuTh 8:00am - 10:50am

EE 132-001 Green Engineering
TuTh 12:30pm - 1:50pm
Winston Chung Hall 143

CS 228-001 Introduction to Deep Learning
MWF 3:00pm - 3:50pm
Gordon Watkins Hall 2240

CEE 132-021 Green Engineering
Tu 6:00pm - 6:50pm
Student Success Center 216

CHE 160A-021 Chemical and Environmental Engineering Laboratory
Th 4:00pm - 4:50pm
SOM EDUCATION I G650`,
  assignments:
    "Lab reports, deep learning assignments, green engineering deliverables, discussion preparation, and weekly review blocks.",
  exams:
    "Expect lab checkoffs, engineering deliverables, and deep learning quizzes/project checkpoints.",
  schedule:
    "Classes are fixed. Wednesday and Friday 8:00am-12:00pm plus Thursday 2:00pm-5:30pm are part-time student assistant shifts at UCR Extension.",
  lifeEvents:
    "Commute, meals, recovery time, and keeping at least one low-pressure evening open if possible.",
};

function createDemoPlanner(): PlannerState {
  const planner = createEmptyPlanner();
  planner.Tue[8] = "CHE 160A";
  planner.Tue[9] = "CHE 160A";
  planner.Tue[12] = "EE 132";
  planner.Tue[13] = "EE 132";
  planner.Tue[18] = "CEE 132";
  planner.Wed[8] = "Student assistant";
  planner.Wed[9] = "Student assistant";
  planner.Wed[10] = "Student assistant";
  planner.Wed[11] = "Student assistant";
  planner.Wed[15] = "CS 228";
  planner.Thu[8] = "CHE 160A";
  planner.Thu[9] = "CHE 160A";
  planner.Thu[12] = "EE 132";
  planner.Thu[13] = "EE 132";
  planner.Thu[14] = "Student assistant";
  planner.Thu[15] = "Student assistant";
  planner.Thu[16] = "Student assistant + CHE 160A sec";
  planner.Thu[17] = "Student assistant";
  planner.Fri[8] = "Student assistant";
  planner.Fri[9] = "Student assistant";
  planner.Fri[10] = "Student assistant";
  planner.Fri[11] = "Student assistant";
  planner.Fri[15] = "CS 228";
  planner.Mon[15] = "CS 228";
  planner.Sat[13] = "Deep learning review";
  planner.Sun[14] = "Lab report + prep";
  return planner;
}

function bandForRisk(score: number) {
  if (score < 35) return { label: "Stable", className: "low" };
  if (score < 70) return { label: "Watch", className: "mid" };
  return { label: "High", className: "high" };
}

function buildStressCurve(score: number, key: "A" | "B" | "C") {
  const curveMap: Record<"A" | "B" | "C", number[]> = {
    A: [-16, -6, 4, 12, 18, 10, 6],
    B: [-12, -2, 2, 7, 10, 4, 1],
    C: [-14, -8, -4, 0, 2, -3, -5],
  };

  return curveMap[key].map((delta) => Math.max(18, Math.min(96, score + delta)));
}

function buildSmoothLinePath(points: number[]) {
  const width = 280;
  const height = 120;
  const padding = 14;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const coordinates = points.map((point, index) => {
    const x = padding + (usableWidth / (points.length - 1)) * index;
    const y = height - padding - (point / 100) * usableHeight;
    return { x, y };
  });

  if (!coordinates.length) return "";
  let path = `M ${coordinates[0].x} ${coordinates[0].y}`;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const current = coordinates[index];
    const next = coordinates[index + 1];
    const controlX = (current.x + next.x) / 2;
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}

export default function Home() {
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [form, setForm] = useState(DEMO_STATE);
  const [planner, setPlanner] = useState<PlannerState>(createDemoPlanner);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerFocusDay, setPlannerFocusDay] = useState<(typeof DAYS)[number]>("Tue");
  const [expandedInput, setExpandedInput] = useState<ToggleKey>("courses");
  const [selectedUploadTarget, setSelectedUploadTarget] = useState<ToggleKey>("courses");
  const [loading, setLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState<null | "calm" | "emergency">(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [whatIfDraft, setWhatIfDraft] = useState<WhatIfDraft>({
    eventName: "NBA playoff game",
    time: "Saturday 7:30 PM",
    duration: "4 hours",
    priority: "High",
    note: "Optional social event with friends",
  });
  const [whatIfScenario, setWhatIfScenario] = useState<WhatIfDraft>({
    eventName: "NBA playoff game",
    time: "Saturday 7:30 PM",
    duration: "4 hours",
    priority: "High",
    note: "Optional social event with friends",
  });

  const plannerSummary = useMemo(
    () =>
      DAYS.map((day) => {
        const entries = planner[day]
          .map((value, hour) => (value.trim() ? `${HOUR_LABELS[hour]} ${value.trim()}` : null))
          .filter(Boolean)
          .join(", ");
        return `${day}: ${entries || "Open"}`;
      }).join("\n"),
    [planner]
  );

  const riskBand = bandForRisk(result?.risk_score ?? 0);
  const priorityLoad =
    whatIfScenario.priority === "High" ? 16 : whatIfScenario.priority === "Medium" ? 10 : 6;

  const planEntries = useMemo<ScenarioPlan[]>(() => {
    const baselineStress = result?.stress_before ?? 44;
    const name = whatIfScenario.eventName || "event";
    const time = whatIfScenario.time || "this week";
    const duration = whatIfScenario.duration || "a few hours";

    const scenarios: ScenarioPlan[] = [
      {
        key: "A",
        label: "Go and enjoy fully",
        subtitle: "Attend the event with no major adjustments",
        tag: "Highest stress",
        tagClass: "tag-high",
        stress: Math.min(95, baselineStress + priorityLoad + 16),
        feasibility: Math.max(42, 76 - priorityLoad),
        changes: `Attend ${name} at ${time} for ${duration}.`,
        impact: "Best convenience and fun, but the week absorbs the full hit.",
        tradeoff: "Highest overload risk after the event.",
        cuts: ["Recovery time shrinks", "Study load stays crowded", "No major reshuffle"],
        curve: [],
      },
      {
        key: "B",
        label: "Go, but finish work earlier",
        subtitle: "Protect the event by moving work earlier",
        tag: "Most balanced",
        tagClass: "tag-mid",
        stress: Math.min(82, baselineStress + Math.round(priorityLoad * 0.7) + 6),
        feasibility: Math.max(60, 86 - Math.round(priorityLoad / 2)),
        changes: `Front-load key work before ${name}.`,
        impact: "Stress rises moderately, but deadlines remain manageable.",
        tradeoff: "You keep the event by compressing earlier study blocks.",
        cuts: ["Move one task earlier", "Compress reading depth", "Protect core deadlines"],
        curve: [],
      },
      {
        key: "C",
        label: "Do not go",
        subtitle: "Keep the week stable and protect workload",
        tag: "Lowest stress",
        tagClass: "tag-low",
        stress: Math.max(28, baselineStress - 6),
        feasibility: Math.min(96, 91 + Math.max(0, 5 - Math.round(priorityLoad / 4))),
        changes: `Skip ${name} and keep the week stable.`,
        impact: "Lowest stress and highest feasibility for the current workload.",
        tradeoff: "You sacrifice the event to protect the schedule.",
        cuts: ["Cut the event itself", "Keep recovery window", "Keep workload unchanged"],
        curve: [],
      },
    ];

    return scenarios.map((plan) => ({
      ...plan,
      curve: buildStressCurve(plan.stress, plan.key),
    }));
  }, [priorityLoad, result, whatIfScenario]);

  const recommendedPlan = useMemo(
    () =>
      [...planEntries].sort((a, b) => {
        const scoreA = a.feasibility - a.stress * 0.45;
        const scoreB = b.feasibility - b.stress * 0.45;
        return scoreB - scoreA;
      })[0],
    [planEntries]
  );

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setForm((current) => ({
      ...current,
      [selectedUploadTarget]: text.slice(0, 12000),
    }));
    event.target.value = "";
  }

  function handlePlannerCellChange(day: (typeof DAYS)[number], hour: number, value: string) {
    setPlanner((current) => {
      const next = { ...current };
      next[day] = [...current[day]];
      next[day][hour] = value;
      return next;
    });
  }

  function loadMyData() {
    setForm(DEMO_STATE);
    setPlanner(createDemoPlanner());
    setPlannerFocusDay("Tue");
  }

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setVoiceStatus(null);

    try {
      const response = await fetch("/api/analyze-overload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workload_text: form.workloadText,
          syllabus: form.courses,
          assignments: form.assignments,
          exam_samples: form.exams,
          schedule: `${form.schedule}\n\nWeekly planner:\n${plannerSummary}`,
          life_events: form.lifeEvents,
          time_constraints: "Protect sleep. Preserve grade-critical work first.",
        }),
      });

      const json = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok) throw new Error(json.error || "Analysis failed");
      setResult(json);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSimulateImpact() {
    setWhatIfScenario(whatIfDraft);
  }

  async function handleVoice(mode: "calm" | "emergency") {
    if (!result) return;
    setVoiceLoading(mode);
    setError(null);
    setVoiceStatus(null);

    try {
      const response = await fetch("/api/generate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_script:
            mode === "emergency"
              ? result.emergency_voice_script || result.voice_script
              : result.voice_script,
          mode,
          consent,
        }),
      });

      const json = (await response.json()) as {
        audio_url?: string;
        error?: string;
        used_mock?: boolean;
        hint?: string;
      };
      if (!response.ok || !json.audio_url) {
        throw new Error(json.error || "Voice playback failed");
      }
      if (json.used_mock) {
        setVoiceStatus(`Mock voice fallback active${json.hint ? ` because ${json.hint}.` : "."}`);
      }
      if (audioRef.current) {
        audioRef.current.src = json.audio_url;
        void audioRef.current.play().catch(() => undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Voice playback failed");
    } finally {
      setVoiceLoading(null);
    }
  }

  return (
    <main className="app-shell">
      <div className="app-frame">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <span className="brand-orb brand-orb-one" />
              <span className="brand-orb brand-orb-two" />
              <span className="brand-glyph">F</span>
            </div>
            <div>
              <div className="eyebrow">Fluxmind</div>
              <p className="title">See overload before you burn out</p>
            </div>
          </div>
          <p className="tagline">Simulates stress, tradeoffs, and what to cut</p>
        </header>

        {result?.used_mock && (
          <div className="status">
            Demo-safe mode active: Gemini is unavailable, but the what-if simulator below still works.
          </div>
        )}
        {error && <div className="error">{error}</div>}

        <section className="panel input-panel">
          <div className="section-head">
            <div>
              <div className="eyebrow">1. Intake</div>
              <h2>Workload + event input</h2>
            </div>
            <div className="upload-row">
              <button className="ghost-btn" onClick={() => uploadRef.current?.click()}>
                Upload file
              </button>
              <button className="soft-btn" onClick={loadMyData}>
                My daily data
              </button>
              <input
                ref={uploadRef}
                type="file"
                accept=".txt,.md,.csv,text/*"
                className="hidden"
                onChange={handleUpload}
              />
            </div>
          </div>

          <div className="toggle-row">
            {FIELDS.map((field) => {
              const active = expandedInput === field.key;
              return (
                <button
                  key={field.key}
                  className={`toggle-chip ${active ? "on selected" : "idle"}`}
                  onClick={() => {
                    setExpandedInput(field.key);
                    setSelectedUploadTarget(field.key);
                  }}
                  type="button"
                >
                  <span className="toggle-dot" />
                  {field.label}
                </button>
              );
            })}
          </div>

          <div className="input-grid">
            <label className="field wide">
              <span>Workload</span>
              <textarea
                className="textarea compact"
                value={form.workloadText}
                onChange={(event) =>
                  setForm((current) => ({ ...current, workloadText: event.target.value }))
                }
                placeholder="Courses, labs, work shifts, commute..."
              />
            </label>

            {expandedInput === "courses" && (
              <label className="field">
                <span>Courses</span>
                <textarea
                  className="textarea compact"
                  value={form.courses}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, courses: event.target.value }))
                  }
                  placeholder="Upload or paste courses"
                />
              </label>
            )}

            {expandedInput === "assignments" && (
              <label className="field">
                <span>Assignments</span>
                <textarea
                  className="textarea compact"
                  value={form.assignments}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, assignments: event.target.value }))
                  }
                  placeholder="Upload or paste assignments"
                />
              </label>
            )}

            {expandedInput === "exams" && (
              <label className="field">
                <span>Exams</span>
                <textarea
                  className="textarea compact"
                  value={form.exams}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, exams: event.target.value }))
                  }
                  placeholder="Upload or paste exams"
                />
              </label>
            )}

            {expandedInput === "schedule" && (
              <label className="field">
                <span>Schedule</span>
                <textarea
                  className="textarea compact"
                  value={form.schedule}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, schedule: event.target.value }))
                  }
                  placeholder="Upload or paste schedule"
                />
              </label>
            )}

            {expandedInput === "lifeEvents" && (
              <label className="field">
                <span>Life events</span>
                <textarea
                  className="textarea compact"
                  value={form.lifeEvents}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, lifeEvents: event.target.value }))
                  }
                  placeholder="Optional life events"
                />
              </label>
            )}
          </div>

          <div className="what-if-card">
            <div className="planner-head">
              <div>
                <div className="eyebrow">What-if input</div>
                <h3>Would this extra event break the week?</h3>
              </div>
              <button className="primary-btn" onClick={handleSimulateImpact} type="button">
                Simulate impact
              </button>
            </div>

            <div className="what-if-grid">
              <label className="field">
                <span>Event name</span>
                <input
                  className="inline-input"
                  value={whatIfDraft.eventName}
                  onChange={(event) =>
                    setWhatIfDraft((current) => ({ ...current, eventName: event.target.value }))
                  }
                  placeholder="NBA playoff game"
                />
              </label>
              <label className="field">
                <span>Time</span>
                <input
                  className="inline-input"
                  value={whatIfDraft.time}
                  onChange={(event) =>
                    setWhatIfDraft((current) => ({ ...current, time: event.target.value }))
                  }
                  placeholder="Saturday 7:30 PM"
                />
              </label>
              <label className="field">
                <span>Duration</span>
                <input
                  className="inline-input"
                  value={whatIfDraft.duration}
                  onChange={(event) =>
                    setWhatIfDraft((current) => ({ ...current, duration: event.target.value }))
                  }
                  placeholder="4 hours"
                />
              </label>
              <label className="field">
                <span>Priority</span>
                <select
                  className="inline-input"
                  value={whatIfDraft.priority}
                  onChange={(event) =>
                    setWhatIfDraft((current) => ({
                      ...current,
                      priority: event.target.value as WhatIfDraft["priority"],
                    }))
                  }
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </label>
              <label className="field wide">
                <span>Optional note</span>
                <input
                  className="inline-input"
                  value={whatIfDraft.note}
                  onChange={(event) =>
                    setWhatIfDraft((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="Optional social event with friends"
                />
              </label>
            </div>
          </div>

          <div className="planner-card">
            <div className="planner-head">
              <div>
                <div className="eyebrow">Weekly planner</div>
                <h3>Week snapshot</h3>
              </div>
              <button className="soft-btn" onClick={() => setPlannerOpen(true)} type="button">
                Open full week
              </button>
            </div>
            <div className="planner-mini-grid">
              {DAYS.map((day) => (
                <button
                  key={day}
                  className={`planner-mini-day ${plannerFocusDay === day ? "active" : ""}`}
                  onClick={() => {
                    setPlannerFocusDay(day);
                    setPlannerOpen(true);
                  }}
                  type="button"
                >
                  <div className="planner-day-head">{day}</div>
                  <div className="planner-mini-content">
                    {planner[day].some(Boolean)
                      ? planner[day]
                          .map((value, hour) =>
                            value.trim() ? `${HOUR_LABELS[hour]} ${value.trim()}` : null
                          )
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((item, index) => <span key={`${day}-${index}`}>{item}</span>)
                      : <span>Open</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="cta-row">
            <button className="primary-btn" onClick={handleAnalyze} disabled={loading}>
              {loading ? "Analyzing..." : "Analyze Overload"}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <div className="eyebrow">2. Dashboard</div>
              <h2>Risk + workload summary</h2>
            </div>
            <div className="score-pill">{recommendedPlan.key} currently balances best</div>
          </div>

          <div className="dashboard-grid">
            <article className="card risk-card">
              <div className="eyebrow">Risk score</div>
              <div className="risk-score">
                <strong>{result ? Math.round(result.risk_score) : 61}</strong>
                <div className={`risk-band ${riskBand.className}`}>{riskBand.label}</div>
              </div>
              <div className="meter meter-risk">
                <span style={{ width: `${result ? result.risk_score : 61}%` }} />
              </div>
            </article>

            <article className="card summary-card">
              <div className="eyebrow">Summary</div>
              <p className="summary-line">
                {result?.summary ??
                  "Your workload is already tight. The main question is whether the extra event pushes stress past a manageable range."}
              </p>
            </article>

            <article className="card stress-card">
              <div className="eyebrow">Stress before / after</div>
              <div className="bar-block">
                <div className="bar-row">
                  <div className="bar-label">
                    <span>Before</span>
                    <span>{result?.stress_before ?? 44}</span>
                  </div>
                  <div className="meter bar-before">
                    <span style={{ width: `${result?.stress_before ?? 44}%` }} />
                  </div>
                </div>
                <div className="bar-row">
                  <div className="bar-label">
                    <span>After event</span>
                    <span>{recommendedPlan.stress}</span>
                  </div>
                  <div className="meter bar-after">
                    <span style={{ width: `${recommendedPlan.stress}%` }} />
                  </div>
                </div>
              </div>
            </article>

            <article className="card cuts-card">
              <div className="eyebrow">Cuts</div>
              <ul className="cut-list">
                {(result?.cut_recommendations?.length
                  ? result.cut_recommendations
                  : recommendedPlan.cuts
                )
                  .slice(0, 4)
                  .map((item) => (
                    <li key={item}>{item}</li>
                  ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <div className="eyebrow">3. What-if simulation</div>
              <h2>Three futures. One decision.</h2>
            </div>
            <div className="score-pill">{whatIfScenario.eventName}</div>
          </div>

          <div className="curve-board">
            {planEntries.map((plan) => (
              <article key={plan.key} className={`curve-card curve-${plan.key.toLowerCase()}`}>
                <div className="curve-head">
                  <div>
                    <div className="curve-key">Plan {plan.key}</div>
                    <h3>{plan.label}</h3>
                  </div>
                  <div className={`scenario-tag ${plan.tagClass}`}>{plan.tag}</div>
                </div>
                <div className="curve-svg-wrap">
                  <svg
                    viewBox="0 0 280 120"
                    className="curve-svg"
                    role="img"
                    aria-label={`${plan.label} stress curve`}
                  >
                    <path d="M 14 106 H 266" className="curve-axis-line" />
                    <path
                      d={buildSmoothLinePath(plan.curve)}
                      className={`curve-path curve-path-${plan.key.toLowerCase()}`}
                    />
                    {plan.curve.map((point, index) => {
                      const x = 14 + ((280 - 28) / (plan.curve.length - 1)) * index;
                      const y = 120 - 14 - (point / 100) * (120 - 28);
                      return (
                        <circle
                          key={`${plan.key}-${index}`}
                          cx={x}
                          cy={y}
                          r="3.5"
                          className={`curve-point curve-point-${plan.key.toLowerCase()}`}
                        />
                      );
                    })}
                  </svg>
                  <div className="curve-axis-labels">
                    {WEEK_AXIS.map((label, index) => (
                      <span key={`${plan.key}-axis-${index}`}>{label}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="plans-grid">
            {planEntries.map((plan) => (
              <article key={plan.key} className={`plan-card plan-${plan.key.toLowerCase()}`}>
                <div className="plan-top">
                  <div className="plan-key">{plan.key}</div>
                  <div className="score-chip">Feasibility {plan.feasibility}%</div>
                </div>
                <h3>{plan.label}</h3>
                <p className="tiny plan-subtitle">{plan.subtitle}</p>
                <div className="metric-row">
                  <div className="metric-pill">Stress {plan.stress}</div>
                  <div className="metric-pill">Feasibility {plan.feasibility}%</div>
                </div>
                <p className="micro-copy">
                  <strong>What changes:</strong> {plan.changes}
                </p>
                <p className="micro-copy">
                  <strong>Impact:</strong> {plan.impact}
                </p>
                <p className="micro-copy">
                  <strong>Tradeoff:</strong> {plan.tradeoff}
                </p>
                <ul className="plan-cut-list">
                  {plan.cuts.map((item) => (
                    <li key={`${plan.key}-${item}`}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="recommend-card">
            <div className="eyebrow">Recommended option</div>
            <div className="recommend-grid">
              <div className="recommend-key">{recommendedPlan.key}</div>
              <div>
                <h3>{recommendedPlan.label}</h3>
                <p className="micro-copy">Why: {recommendedPlan.impact}</p>
                <p className="tiny">Impact: {recommendedPlan.tradeoff}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <div className="eyebrow">4. Voice</div>
              <h2>AI-generated support</h2>
            </div>
            <p className="micro-copy">Small, opt-in, secondary</p>
          </div>

          <div className="voice-grid">
            <article className="voice-card">
              <div className="voice-actions">
                <button
                  className="secondary-btn"
                  onClick={() => handleVoice("calm")}
                  disabled={!result || voiceLoading !== null}
                >
                  {voiceLoading === "calm" ? "Generating..." : "Play Calm Voice"}
                </button>
                <button
                  className="danger-btn"
                  onClick={() => handleVoice("emergency")}
                  disabled={!result || voiceLoading !== null}
                >
                  {voiceLoading === "emergency" ? "Generating..." : "Emergency Comfort Mode"}
                </button>
              </div>
              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>AI-generated voice</span>
              </label>
            </article>

            <article className="voice-card">
              <audio ref={audioRef} controls className="audio-player" />
              {voiceStatus && <p className="tiny">{voiceStatus}</p>}
            </article>
          </div>
        </section>

        {plannerOpen && (
          <div className="planner-modal-backdrop" onClick={() => setPlannerOpen(false)}>
            <div className="planner-modal" onClick={(event) => event.stopPropagation()}>
              <div className="planner-modal-head">
                <div>
                  <div className="eyebrow">Weekly planner</div>
                  <h2>0-24 hour week view</h2>
                </div>
                <button className="ghost-btn" onClick={() => setPlannerOpen(false)} type="button">
                  Close
                </button>
              </div>

              <div className="planner-expanded">
                <div className="planner-hours">
                  <div className="planner-hours-gap" />
                  {HOUR_LABELS.map((hour) => (
                    <div key={hour} className="planner-hour">
                      {hour}
                    </div>
                  ))}
                </div>

                <div className="planner-expanded-grid">
                  {DAYS.map((day) => (
                    <div
                      key={day}
                      className={`planner-expanded-day ${
                        plannerFocusDay === day ? "planner-expanded-day-active" : ""
                      }`}
                    >
                      <div className="planner-expanded-head">{day}</div>
                      <div className="planner-expanded-cells">
                        {HOURS.map((hour) => (
                          <input
                            key={`${day}-${hour}`}
                            className="planner-cell-input"
                            value={planner[day][hour]}
                            onChange={(event) =>
                              handlePlannerCellChange(day, hour, event.target.value)
                            }
                            onFocus={() => setPlannerFocusDay(day)}
                            placeholder={hour === 0 ? "Add event" : ""}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
