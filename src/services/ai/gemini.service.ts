import { MOCK_OVERLOAD_ANALYSIS } from "./mock.fixture";
import { buildAnalysisPrompt, type AcademicInputBundle } from "./prompt.templates";
import { parseOverloadAnalysis, type OverloadAnalysis } from "./response.schema";

function getGeminiUrl() {
  const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export type GeminiAnalyzeResult =
  | { ok: true; data: OverloadAnalysis }
  | { ok: false; error: string };

/**
 * Calls Gemini with a schema-oriented prompt. All reasoning lives in the model + prompt.
 */
export async function analyzeAcademicLoad(
  input: AcademicInputBundle,
  apiKey: string | undefined
): Promise<GeminiAnalyzeResult> {
  if (process.env.USE_MOCK_AI === "true") {
    void input;
    return { ok: true, data: MOCK_OVERLOAD_ANALYSIS };
  }

  if (!apiKey) {
    return { ok: false, error: "Missing GEMINI_API_KEY" };
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildAnalysisPrompt(input) }],
      },
    ],
    generationConfig: {
      temperature: 0.35,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(`${getGeminiUrl()}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Gemini HTTP ${res.status}: ${text}` };
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  if (!text.trim()) {
    return { ok: false, error: "Empty Gemini response" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Gemini returned non-JSON" };
  }

  try {
    const data = parseOverloadAnalysis(parsed);
    return { ok: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Schema validation failed";
    return { ok: false, error: message };
  }
}
