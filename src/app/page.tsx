"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type PlanCard = {
  label: string;
  stress_score: number;
  feasibility_score: number;
  summary: string;
  preserved: string[];
  delayed: string[];
  removed: string[];
};

type WorkloadItem = {
  label: string;
  estimated_hours_per_week?: number;
  complexity?: "low" | "medium" | "high";
  notes?: string;
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
  workload_breakdown?: WorkloadItem[];
  conflicts?: string[];
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

const CURVE_BOX = { width: 300, height: 144, padL: 30, padR: 10, padT: 10, padB: 28 };

function curveCoords(points: number[]) {
  const { width, height, padL, padR, padT, padB } = CURVE_BOX;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  return points.map((point, index) => ({
    x: padL + (plotW / Math.max(1, points.length - 1)) * index,
    y: padT + plotH - (point / 100) * plotH,
    value: point,
  }));
}

function buildSmoothLinePath(points: number[]) {
  const coordinates = curveCoords(points);

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
  const [whatIfDraft, setWhatIfDraft] = useState({
    eventName: "NBA playoff game",
    time: "Saturday 7:30 PM",
    duration: "4 hours",
    priority: "High" as "Low" | "Medium" | "High",
    note: "Optional social event with friends",
  });
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
  const [breatheOpen, setBreatheOpen] = useState(false);
  const [breathePhase, setBreathePhase] = useState<"in" | "hold" | "out">("in");
  const [eggOpen, setEggOpen] = useState(false);
  const [tentMode, setTentMode] = useState(false);
  const [tents, setTents] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [restOpen, setRestOpen] = useState(false);
  const [snowTick, setSnowTick] = useState(0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (event.key === "b" || event.key === "B") setBreatheOpen(true);
      if (event.key === "Escape") {
        setBreatheOpen(false);
        setRestOpen(false);
        setTentMode(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!tentMode) return;
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target && target.closest("button, a, input, textarea, select, .egg-panel"))
        return;
      setTents((prev) => [
        ...prev,
        { id: Date.now() + Math.random(), x: event.clientX, y: event.clientY },
      ]);
    }
    document.body.style.cursor = "crosshair";
    window.addEventListener("click", onClick);
    return () => {
      document.body.style.cursor = "auto";
      window.removeEventListener("click", onClick);
    };
  }, [tentMode]);

  const snowflakes = useMemo(() => {
    if (snowTick === 0) return [] as Array<{ id: number; left: number; dur: number; size: number; glyph: string }>;
    return Array.from({ length: 60 }, (_, i) => ({
      id: snowTick * 1000 + i,
      left: Math.random() * 100,
      dur: 3 + Math.random() * 4,
      size: 12 + Math.random() * 14,
      glyph: ["❄", "❅", "❆"][Math.floor(Math.random() * 3)],
    }));
  }, [snowTick]);

  useEffect(() => {
    if (snowTick === 0) return;
    const timer = window.setTimeout(() => setSnowTick(0), 8000);
    return () => window.clearTimeout(timer);
  }, [snowTick]);

  useEffect(() => {
    if (!breatheOpen) return;
    const cycle: Array<{ phase: "in" | "hold" | "out"; ms: number }> = [
      { phase: "in", ms: 4000 },
      { phase: "hold", ms: 4000 },
      { phase: "out", ms: 4000 },
    ];
    let index = 0;
    setBreathePhase(cycle[0].phase);
    const id = window.setInterval(() => {
      index = (index + 1) % cycle.length;
      setBreathePhase(cycle[index].phase);
    }, 4000);
    return () => window.clearInterval(id);
  }, [breatheOpen]);
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
          life_events: [
            activeSections.lifeEvents ? form.lifeEvents : "",
            whatIfDraft.eventName
              ? `What-if event: ${whatIfDraft.eventName} on ${whatIfDraft.time || "this week"}, lasting ${whatIfDraft.duration || "a few hours"}. Priority: ${whatIfDraft.priority}. Note: ${whatIfDraft.note || "n/a"}.`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
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
    if (!consent) {
      setError(
        "Please tick the 'AI-generated voice' consent checkbox below before playing."
      );
      return;
    }
    setVoiceLoading(mode);
    setError(null);
    setVoiceStatus(null);

    const calmFallback =
      "Take a breath. Your workload is tight, but the plan already shows a clearer path. Focus on the next decision only.";
    const emergencyFallback =
      "Pause for a moment. You are not behind. Put down the heaviest task, breathe slowly, and we will re-plan together.";
    const script =
      mode === "emergency"
        ? result?.emergency_voice_script || result?.voice_script || emergencyFallback
        : result?.voice_script || calmFallback;

    try {
      const response = await fetch("/api/generate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_script: script,
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
            Demo mode: running on curated simulation data so the what-if engine stays responsive.
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

          <div className="what-if-card" style={{ marginTop: 16, padding: 16, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "rgba(255,255,255,0.03)" }}>
            <div className="planner-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div className="eyebrow">What-if input</div>
                <h3 style={{ margin: 0 }}>Would this extra event break the week?</h3>
              </div>
            </div>
            <div className="what-if-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
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
                      priority: event.target.value as "Low" | "Medium" | "High",
                    }))
                  }
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </label>
              <label className="field" style={{ gridColumn: "span 2" }}>
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
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
              This event is fed into the analysis. Click &ldquo;Analyze Overload&rdquo; below to simulate.
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

            <article
              className="card load-card"
              style={{ gridColumn: "span 2" }}
            >
              <div className="eyebrow">Top load this week</div>
              {(() => {
                const items = (result?.workload_breakdown ?? [
                  { label: "CHE 160A lab", estimated_hours_per_week: 12 },
                  { label: "CS 228 deep learning", estimated_hours_per_week: 10 },
                  { label: "Student assistant shifts", estimated_hours_per_week: 9 },
                  { label: "EE 132 deliverables", estimated_hours_per_week: 6 },
                ]).slice(0, 4);
                const maxHrs = Math.max(
                  1,
                  ...items.map((it) => it.estimated_hours_per_week ?? 4)
                );
                const complexityColor: Record<string, string> = {
                  high: "#ff7a6b",
                  medium: "#ffb347",
                  low: "#6cc4a1",
                };
                return (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    {items.map((it) => {
                      const hrs = it.estimated_hours_per_week ?? 4;
                      const pct = Math.round((hrs / maxHrs) * 100);
                      const color = complexityColor[it.complexity ?? "medium"];
                      return (
                        <div key={it.label}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 12,
                              marginBottom: 4,
                              color: "#2f3a4a",
                            }}
                          >
                            <span
                              style={{
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "70%",
                              }}
                            >
                              {it.label}
                            </span>
                            <span style={{ fontWeight: 600 }}>{hrs}h</span>
                          </div>
                          <div
                            style={{
                              height: 6,
                              borderRadius: 4,
                              background: "rgba(0,0,0,0.06)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: "100%",
                                background: color,
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
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
                  <svg
                    viewBox={`0 0 ${CURVE_BOX.width} ${CURVE_BOX.height}`}
                    className="curve-svg"
                    role="img"
                    aria-label={`${plan.label} stress curve`}
                  >
                    {[0, 25, 50, 75, 100].map((tick) => {
                      const { padL, padR, padT, padB, width, height } = CURVE_BOX;
                      const plotH = height - padT - padB;
                      const y = padT + plotH - (tick / 100) * plotH;
                      return (
                        <g key={`${plan.key}-grid-${tick}`}>
                          <line
                            x1={padL}
                            x2={width - padR}
                            y1={y}
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity={tick === 0 ? 0.35 : 0.08}
                            strokeDasharray={tick === 0 ? "" : "2 3"}
                          />
                          <text
                            x={padL - 6}
                            y={y + 3}
                            textAnchor="end"
                            fontSize="8"
                            fill="currentColor"
                            opacity={0.55}
                          >
                            {tick}
                          </text>
                        </g>
                      );
                    })}
                    <path
                      d={buildSmoothLinePath(plan.curve)}
                      className={`curve-path curve-path-${plan.key.toLowerCase()}`}
                    />
                    {curveCoords(plan.curve).map((coord, index) => (
                      <g key={`${plan.key}-point-${index}`}>
                        <circle
                          cx={coord.x}
                          cy={coord.y}
                          r="3.5"
                          className={`curve-point curve-point-${plan.key.toLowerCase()}`}
                        >
                          <title>{`${WEEK_AXIS[index]} · Stress ${coord.value}`}</title>
                        </circle>
                        <circle
                          cx={coord.x}
                          cy={coord.y}
                          r="10"
                          fill="transparent"
                          style={{ cursor: "pointer" }}
                        >
                          <title>{`${WEEK_AXIS[index]} · Stress ${coord.value}`}</title>
                        </circle>
                      </g>
                    ))}
                    {WEEK_AXIS.map((label, index) => {
                      const coord = curveCoords(plan.curve)[index];
                      return (
                        <text
                          key={`${plan.key}-axis-${index}`}
                          x={coord.x}
                          y={CURVE_BOX.height - 8}
                          textAnchor="middle"
                          fontSize="9"
                          fill="currentColor"
                          opacity={0.6}
                        >
                          {label}
                        </text>
                      );
                    })}
                  </svg>
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
                  disabled={voiceLoading !== null}
                >
                  {voiceLoading === "calm" ? "Generating..." : "Play Calm Voice"}
                </button>
                <button
                  className="danger-btn"
                  onClick={() => handleVoice("emergency")}
                  disabled={voiceLoading !== null}
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

        {breatheOpen && (
          <div
            onClick={() => setBreatheOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(4,8,16,0.88)",
              backdropFilter: "blur(14px)",
              zIndex: 9999,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              animation: "fadeIn 0.4s ease",
            }}
          >
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 30% 30%, #7ecfff, #6c5bd1 70%)",
                boxShadow: "0 0 80px rgba(126,207,255,0.45)",
                transform:
                  breathePhase === "in"
                    ? "scale(1.5)"
                    : breathePhase === "hold"
                    ? "scale(1.5)"
                    : "scale(1)",
                transition: "transform 4s ease-in-out",
              }}
            />
            <div
              style={{
                marginTop: 36,
                color: "#eaf4ff",
                fontSize: 18,
                letterSpacing: 4,
                textTransform: "uppercase",
                fontWeight: 300,
              }}
            >
              {breathePhase === "in"
                ? "Breathe in"
                : breathePhase === "hold"
                ? "Hold"
                : "Breathe out"}
            </div>
            <div
              style={{
                marginTop: 14,
                color: "#7a8499",
                fontSize: 12,
                letterSpacing: 1,
              }}
            >
              click anywhere to close · esc
            </div>
            <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
          </div>
        )}

        {/* Tent markers */}
        {tents.map((t) => (
          <div
            key={t.id}
            style={{
              position: "fixed",
              left: t.x - 12,
              top: t.y - 14,
              fontSize: 22,
              pointerEvents: "none",
              filter: "drop-shadow(0 0 6px rgba(42,255,160,0.6))",
              animation: "eggPop 0.3s cubic-bezier(.175,.885,.32,1.275)",
              zIndex: 5000,
            }}
          >
            🏕️
          </div>
        ))}

        {/* Snowfall */}
        {snowflakes.map((f) => (
          <div
            key={f.id}
            style={{
              position: "fixed",
              top: -20,
              left: `${f.left}vw`,
              fontSize: f.size,
              color: "#fff",
              textShadow: "0 0 6px rgba(255,255,255,0.7)",
              pointerEvents: "none",
              zIndex: 5000,
              animation: `eggSnow ${f.dur}s linear forwards`,
            }}
          >
            {f.glyph}
          </div>
        ))}

        {/* Rest overlay */}
        {restOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "linear-gradient(180deg,#0d1020 0%,#060810 100%)",
              zIndex: 9998,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              animation: "fadeIn 1s ease",
            }}
          >
            {Array.from({ length: 50 }).map((_, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  width: 2,
                  height: 2,
                  background: "#fff",
                  borderRadius: "50%",
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  opacity: 0,
                  animation: `eggTwinkle 3s ease-in-out ${Math.random() * 3}s infinite`,
                }}
              />
            ))}
            <div style={{ textAlign: "center", color: "#e0e0e0" }}>
              <h2
                style={{
                  fontSize: 32,
                  fontWeight: 300,
                  letterSpacing: 4,
                  margin: 0,
                }}
              >
                You&apos;ve done enough
              </h2>
              <p style={{ fontSize: 15, color: "#9090a0", marginTop: 16 }}>
                Take a rest. Tomorrow will be better.
              </p>
              <button
                onClick={() => setRestOpen(false)}
                style={{
                  marginTop: 32,
                  padding: "10px 24px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fff",
                  borderRadius: 24,
                  cursor: "pointer",
                  fontSize: 13,
                  backdropFilter: "blur(8px)",
                }}
              >
                Maybe later
              </button>
            </div>
          </div>
        )}

        {/* Easter-egg side launcher */}
        <div
          className="egg-panel"
          style={{
            position: "fixed",
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 6000,
            display: "flex",
            alignItems: "center",
            fontFamily: "inherit",
          }}
        >
          {eggOpen && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 10,
                marginRight: 10,
                background: "rgba(14,18,24,0.94)",
                border: "1px solid rgba(126,207,255,0.25)",
                borderRadius: 14,
                backdropFilter: "blur(12px)",
                boxShadow: "0 14px 40px rgba(0,0,0,0.5)",
                animation: "eggSlideIn 0.25s ease",
                minWidth: 188,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: "#7ecfff",
                  padding: "4px 6px 6px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  marginBottom: 4,
                }}
              >
                Calm corner
              </div>
              <EggItem
                icon="🏕️"
                label={tentMode ? "Exit tent mode" : "Build a tent"}
                color={tentMode ? "#ff5a5a" : "#a259ff"}
                onClick={() => setTentMode((v) => !v)}
              />
              {tents.length > 0 && (
                <EggItem
                  icon="🧹"
                  label={`Clear tents (${tents.length})`}
                  color="#7a8499"
                  onClick={() => setTents([])}
                />
              )}
              <EggItem
                icon="🫁"
                label="Breathe"
                color="#00d2ff"
                hint="B"
                onClick={() => setBreatheOpen(true)}
              />
              <EggItem
                icon="❄️"
                label="Let it snow"
                color="#bde0ff"
                onClick={() => setSnowTick((t) => t + 1)}
              />
              <EggItem
                icon="🌙"
                label="Rest"
                color="#2affa0"
                onClick={() => setRestOpen(true)}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setEggOpen((v) => !v)}
            title="A little corner of calm"
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              padding: "18px 10px",
              border: "1px solid rgba(126,207,255,0.35)",
              borderRight: "none",
              borderRadius: "14px 0 0 14px",
              background:
                "linear-gradient(180deg, rgba(14,18,24,0.95), rgba(30,40,58,0.95))",
              color: "#eaf4ff",
              cursor: "pointer",
              fontSize: 12,
              letterSpacing: 3,
              fontWeight: 600,
              textTransform: "uppercase",
              backdropFilter: "blur(8px)",
              boxShadow: "-6px 6px 24px rgba(0,0,0,0.4)",
            }}
          >
            {eggOpen ? "× Close" : "✦ Calm corner"}
          </button>
        </div>

        <style>{`
          @keyframes eggPop { from { transform: scale(0) rotate(-20deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }
          @keyframes eggSnow { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(360deg); opacity: 0.4; } }
          @keyframes eggTwinkle { 0%,100% { opacity: 0; } 50% { opacity: 0.7; } }
          @keyframes eggSlideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
        `}</style>
      </div>
    </main>
  );
}

function EggItem({
  icon,
  label,
  color,
  hint,
  onClick,
}: {
  icon: string;
  label: string;
  color: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        width: "100%",
        border: `1px solid ${color}40`,
        background: `${color}10`,
        color: "#eaf4ff",
        borderRadius: 10,
        cursor: "pointer",
        fontSize: 13,
        textAlign: "left",
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}22`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `${color}10`;
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {hint && (
        <span
          style={{
            fontSize: 10,
            color: "#7a8499",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            padding: "1px 5px",
          }}
        >
          {hint}
        </span>
      )}
    </button>
  );
}
