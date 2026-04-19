import { NextResponse } from "next/server";
import { adaptAnalysisForProduct } from "@/core/productAdapter";
import { toDashboardPayload } from "@/core/formattingEngine";
import { analyzeAcademicLoad } from "@/services/ai/gemini.service";
import { MOCK_OVERLOAD_ANALYSIS } from "@/services/ai/mock.fixture";
import type { AcademicInputBundle } from "@/services/ai/prompt.templates";

export const runtime = "nodejs";

type Body = Partial<AcademicInputBundle> & {
  workload_text?: string;
};

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

  const gemini = await analyzeAcademicLoad(bundle, process.env.GEMINI_API_KEY);
  const analysis = gemini.ok ? gemini.data : MOCK_OVERLOAD_ANALYSIS;
  const usedMock = !gemini.ok;

  const presentation = toDashboardPayload(analysis);
  const product = adaptAnalysisForProduct(analysis);

  return NextResponse.json({
    ...product,
    workload_breakdown: analysis.workload_breakdown,
    conflicts: analysis.conflicts,
    actions: analysis.actions,
    stress_simulation: analysis.stress_simulation,
    used_mock: usedMock,
    mock_reason: usedMock ? gemini.error : null,
    presentation: {
      risk: presentation.risk,
      stress_series: presentation.stress_series,
    },
  });
}
