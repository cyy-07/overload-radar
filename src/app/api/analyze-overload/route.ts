import { NextResponse } from "next/server";
import { adaptAnalysisForProduct } from "@/core/productAdapter";
import { toDashboardPayload } from "@/core/formattingEngine";
import { analyzeAcademicLoad } from "@/services/ai/gemini.service";
import { MOCK_OVERLOAD_ANALYSIS } from "@/services/ai/mock.fixture";
import type { AcademicInputBundle } from "@/services/ai/prompt.templates";
import type { OverloadAnalysis } from "@/services/ai/response.schema";

export const runtime = "nodejs";

type Body = Partial<AcademicInputBundle> & {
  workload_text?: string;
};

// In-memory cache to avoid burning free-tier Gemini quota on identical inputs
// during demos. Keyed by a stable hash of the bundle. Process-local, fine for demo.
const analysisCache = new Map<string, OverloadAnalysis>();
const CACHE_MAX = 8;

function hashBundle(bundle: AcademicInputBundle): string {
  const raw = [
    bundle.workload_text,
    bundle.syllabus,
    bundle.assignments,
    bundle.exam_samples,
    bundle.schedule,
    bundle.life_events,
    bundle.time_constraints,
  ].join("||");
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) {
    h = (h * 31 + raw.charCodeAt(i)) | 0;
  }
  return String(h);
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bundle: AcademicInputBundle = {
    workload_text: String(body.workload_text ?? ""),
    syllabus: String(body.syllabus ?? ""),
    assignments: String(body.assignments ?? ""),
    exam_samples: String(body.exam_samples ?? ""),
    schedule: body.schedule,
    life_events: body.life_events,
    time_constraints: body.time_constraints,
  };

  const cacheKey = hashBundle(bundle);
  const cached = analysisCache.get(cacheKey);

  let analysis: OverloadAnalysis;
  let usedMock = false;
  let failureReason: string | null = null;

  if (cached) {
    analysis = cached;
  } else {
    const gemini = await analyzeAcademicLoad(bundle, process.env.GEMINI_API_KEY);
    if (gemini.ok) {
      analysis = gemini.data;
      if (analysisCache.size >= CACHE_MAX) {
        const firstKey = analysisCache.keys().next().value;
        if (firstKey !== undefined) analysisCache.delete(firstKey);
      }
      analysisCache.set(cacheKey, analysis);
    } else {
      analysis = MOCK_OVERLOAD_ANALYSIS;
      usedMock = true;
      failureReason = gemini.error;
    }
  }

  const presentation = toDashboardPayload(analysis);
  const product = adaptAnalysisForProduct(analysis);

  return NextResponse.json({
    ...product,
    workload_breakdown: analysis.workload_breakdown,
    conflicts: analysis.conflicts,
    actions: analysis.actions,
    stress_simulation: analysis.stress_simulation,
    used_mock: usedMock,
    mock_reason: usedMock ? failureReason : null,
    presentation: {
      risk: presentation.risk,
      stress_series: presentation.stress_series,
    },
  });
}
