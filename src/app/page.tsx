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

function getPlanDefinition(key: "A" | "B" | "C") {
  if (key === "A") {
    return {
      title: "Baseline Reality",
      subtitle: "No intervention",
      fallbackSummary:
        "Keep the current week unchanged and test whether the existing load already pushes the system toward overload.",
      fallbackCuts: ["No cuts", "Keep all deadlines", "Reality as-is"],
    };
  }

  if (key === "B") {
    return {
      title: "Tradeoff Shift",
      subtitle: "Small sacrifice",
      fallbackSummary:
        "Protect one life event by delaying a lower-priority task and compressing lighter study blocks.",
      fallbackCuts: ["Delay one low-priority task", "Reduce reading depth", "Compress one study block"],
    };
  }

  return {
    title: "Recovery / Crisis Mode",
    subtitle: "Protect the system",
    fallbackSummary:
      "Restructure the week hard to avoid crossing the crash boundary when stress is already elevated.",
    fallbackCuts: ["Drop optional work", "Reduce assignment scope", "Preserve sleep + core deadlines"],
  };
}

function buildStressCurve(score: number, key: "A" | "B" | "C") {
  const curveMap: Record<"A" | "B" | "C", number[]> = {
    A: [-18, -8, 0, 4, 10, 6, -4],
    B: [-14, -2, 8, 14, 18, 8, -2],
    C: [-10, 8, 18, 24, 30, 14, 6],
  };

  return curveMap[key].map((delta) => {
    const next = Math.max(12, Math.min(100, score + delta));
    return next;
  });
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

  if (coordinates.length === 0) {
    return "";
  }

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
  const [activeSections, setActiveSections] = useState<Record<ToggleKey, boolean>>({
    courses: true,
    assignments: true,
    exams: true,
    schedule: true,
    lifeEvents: true,
  });
  const [selectedUploadTarget, setSelectedUploadTarget] = useState<ToggleKey>("courses");
  const [loading, setLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState<null | "calm" | "emergency">(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const recommendedPlan = useMemo(() => {
    if (!result) return null;
    return Object.entries(result.plans).sort(
      (a, b) => b[1].feasibility_score - a[1].feasibility_score
    )[0];
  }, [result]);

  const plannerSummary = useMemo(
    () =>
      DAYS.map((day) => {
        const entries = planner[day]
          .map((value, hour) => (value.trim() ? `${HOUR_LABELS[hour]} ${value.trim()}` : null))
          .filter(Boolean)
          .join(", ");
        return `${day}: ${entries || "Open"}`;
      })
        .join("\n")
        .trim(),
    [planner]
  );

  const riskBand = bandForRisk(result?.risk_score ?? 0);
  const planEntries = useMemo(
    () =>
      (["A", "B", "C"] as const).map((key) => {
        const incoming = result?.plans[key];
        const definition = getPlanDefinition(key);
        const stress =
          incoming?.stress_score ??
          (key === "A"
            ? Math.max(result?.stress_before ?? 46, 46)
            : key === "B"
              ? Math.max((result?.stress_before ?? 46) + 10, 58)
              : Math.max((result?.stress_before ?? 46) + 18, 68));

        return {
          key,
          label: incoming?.label ?? definition.title,
          subtitle: definition.subtitle,
          feasibility: incoming?.feasibility_score ?? (key === "A" ? 92 : key === "B" ? 74 : 58),
          summary: incoming?.summary ?? definition.fallbackSummary,
          cuts:
            incoming && incoming.removed.length > 0
              ? incoming.removed.slice(0, 3)
              : definition.fallbackCuts,
          stress,
          curve: buildStressCurve(stress, key),
        };
      }),
    [result]
  );

  function toggleSection(key: ToggleKey) {
    setExpandedInput(key);
    setActiveSections((current) => ({ ...current, [key]: !current[key] || !current[key] }));
    setSelectedUploadTarget(key);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setForm((current) => ({
      ...current,
      [selectedUploadTarget]: text.slice(0, 12000),
    }));
    setActiveSections((current) => ({ ...current, [selectedUploadTarget]: true }));
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
    setActiveSections({
      courses: true,
      assignments: true,
      exams: true,
      schedule: true,
      lifeEvents: true,
    });
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
          syllabus: activeSections.courses ? form.courses : "",
          assignments: activeSections.assignments ? form.assignments : "",
          exam_samples: activeSections.exams ? form.exams : "",
          schedule: activeSections.schedule ? `${form.schedule}\n\nWeekly planner:\n${plannerSummary}` : "",
          life_events: activeSections.lifeEvents ? form.lifeEvents : "",
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
        setVoiceStatus(
          `Mock voice fallback active${json.hint ? ` because ${json.hint}.` : "."}`
        );
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
            Mock analysis active{result.mock_reason ? `: ${result.mock_reason}` : "."}
          </div>
        )}
        {error && <div className="error">{error}</div>}

        <section className="panel input-panel">
          <div className="section-head">
            <div>
              <div className="eyebrow">1. Input panel</div>
              <h2>Workload intake</h2>
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
                  className={`toggle-chip ${active ? "on selected" : "idle"} `}
                  onClick={() => toggleSection(field.key)}
                  type="button"
                >
                  <span className="toggle-dot" />
                  {field.label}
                </button>
              );
            })}
          </div>

          <div className="input-accent-row">
            <div className="input-accent-card accent-courses">
              <span className="accent-label">Course load</span>
              <strong>5 tracked class blocks</strong>
            </div>
            <div className="input-accent-card accent-work">
              <span className="accent-label">Fixed work time</span>
              <strong>11.5h student assistant</strong>
            </div>
            <div className="input-accent-card accent-mode">
              <span className="accent-label">Input mode</span>
              <strong>Upload + quick planner edit</strong>
            </div>
          </div>

          <div className="input-grid">
            <label className="field wide">
              <span>Workload</span>
              <textarea
                className="textarea compact"
                placeholder="Courses, labs, work shifts, commute..."
                value={form.workloadText}
                onChange={(e) =>
                  setForm((current) => ({ ...current, workloadText: e.target.value }))
                }
              />
            </label>

            {expandedInput === "courses" && (
              <label className="field">
                <span>Courses</span>
                <textarea
                  className="textarea compact"
                  placeholder="Upload or paste courses"
                  value={form.courses}
                  onChange={(e) => setForm((current) => ({ ...current, courses: e.target.value }))}
                />
              </label>
            )}

            {expandedInput === "assignments" && (
              <label className="field">
                <span>Assignments</span>
                <textarea
                  className="textarea compact"
                  placeholder="Upload or paste assignments"
                  value={form.assignments}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, assignments: e.target.value }))
                  }
                />
              </label>
            )}

            {expandedInput === "exams" && (
              <label className="field">
                <span>Exams</span>
                <textarea
                  className="textarea compact"
                  placeholder="Upload or paste exams"
                  value={form.exams}
                  onChange={(e) => setForm((current) => ({ ...current, exams: e.target.value }))}
                />
              </label>
            )}

            {expandedInput === "schedule" && (
              <label className="field">
                <span>Schedule</span>
                <textarea
                  className="textarea compact"
                  placeholder="Upload or paste schedule"
                  value={form.schedule}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, schedule: e.target.value }))
                  }
                />
              </label>
            )}

            {expandedInput === "lifeEvents" && (
              <label className="field">
                <span>Life events</span>
                <textarea
                  className="textarea compact"
                  placeholder="Optional life events"
                  value={form.lifeEvents}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, lifeEvents: e.target.value }))
                  }
                />
              </label>
            )}
          </div>

          <div className="planner-card">
            <div className="planner-head">
              <div>
                <div className="eyebrow">Weekly planner</div>
                <h3>Week snapshot</h3>
              </div>
              <button
                className="soft-btn"
                onClick={() => setPlannerOpen(true)}
                type="button"
              >
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
              <div className="eyebrow">2. Risk + summary</div>
              <h2>Decision dashboard</h2>
            </div>
            {recommendedPlan && <div className="score-pill">Recommended {recommendedPlan[0]}</div>}
          </div>

          <div className="dashboard-grid">
            <article className="card risk-card">
              <div className="eyebrow">Risk score</div>
              <div className="risk-score">
                <strong>{result ? Math.round(result.risk_score) : "--"}</strong>
                <div className={`risk-band ${riskBand.className}`}>{riskBand.label}</div>
              </div>
              <div className="meter meter-risk">
                <span style={{ width: `${result ? result.risk_score : 0}%` }} />
              </div>
            </article>

            <article className="card summary-card">
              <div className="eyebrow">Summary</div>
              <p className="summary-line">
                {result
                  ? result.summary
                  : "Run analysis to see overload risk, stress change, and plan comparison."}
              </p>
            </article>

            <article className="card stress-card">
              <div className="eyebrow">Stress before / after</div>
              <div className="bar-block">
                <div className="bar-row">
                  <div className="bar-label">
                    <span>Before</span>
                    <span>{result ? result.stress_before : "--"}</span>
                  </div>
                  <div className="meter bar-before">
                    <span style={{ width: `${result ? result.stress_before : 0}%` }} />
                  </div>
                </div>
                <div className="bar-row">
                  <div className="bar-label">
                    <span>After</span>
                    <span>{result ? result.stress_after : "--"}</span>
                  </div>
                  <div className="meter bar-after">
                    <span style={{ width: `${result ? result.stress_after : 0}%` }} />
                  </div>
                </div>
              </div>
            </article>

            <article className="card cuts-card">
              <div className="eyebrow">Cut recommendations</div>
              <ul className="cut-list">
                {(result?.cut_recommendations ?? ["Cuts will appear here."])
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
              <div className="eyebrow">3. Plan comparison</div>
              <h2>Plan A / B / C simulation</h2>
            </div>
          </div>

          <div className="curve-board">
            {planEntries.map((plan) => (
              <article key={`curve-${plan.key}`} className={`curve-card curve-${plan.key.toLowerCase()}`}>
                <div className="curve-head">
                  <div>
                    <div className="curve-key">Plan {plan.key}</div>
                    <h3>{plan.label}</h3>
                  </div>
                  <div className="score-chip">Stress {plan.stress}</div>
                </div>
                <div className="curve-svg-wrap">
                  <svg viewBox="0 0 280 120" className="curve-svg" role="img" aria-label={`${plan.label} stress curve`}>
                    <path d="M 14 106 H 266" className="curve-axis-line" />
                    <path d={buildSmoothLinePath(plan.curve)} className={`curve-path curve-path-${plan.key.toLowerCase()}`} />
                    {plan.curve.map((point, index) => {
                      const x = 14 + ((280 - 28) / (plan.curve.length - 1)) * index;
                      const y = 120 - 14 - (point / 100) * (120 - 28);
                      return <circle key={`${plan.key}-point-${index}`} cx={x} cy={y} r="3.5" className={`curve-point curve-point-${plan.key.toLowerCase()}`} />;
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
            {planEntries.map((plan) => {
              return (
                <article key={plan.key} className={`plan-card plan-${plan.key.toLowerCase()}`}>
                  <div className="plan-top">
                    <div className="plan-key">{plan.key}</div>
                    <div className="score-chip">Feasibility {plan.feasibility}%</div>
                  </div>
                  <h3>{plan.label}</h3>
                  <p className="tiny plan-subtitle">{plan.subtitle}</p>
                  <p className="micro-copy">{plan.summary}</p>
                  <div className="tiny plan-stats">Stress {plan.stress} · Feasibility {plan.feasibility}%</div>
                  <ul className="plan-cut-list">
                    {plan.cuts.map((item) => (
                      <li key={`${plan.key}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
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
                  onChange={(e) => setConsent(e.target.checked)}
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
                            onChange={(e) => handlePlannerCellChange(day, hour, e.target.value)}
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
