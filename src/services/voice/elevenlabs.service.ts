const ELEVEN_BASE = "https://api.elevenlabs.io/v1/text-to-speech";

export type TtsResult =
  | { ok: true; audioBuffer: ArrayBuffer; contentType: string }
  | { ok: false; error: string };

/**
 * Raw ElevenLabs HTTP: no analysis, narration only.
 */
export async function synthesizeSpeech(params: {
  apiKey: string;
  voiceId: string;
  text: string;
  modelId?: string;
}): Promise<TtsResult> {
  const { apiKey, voiceId, text, modelId = "eleven_turbo_v2_5" } = params;

  const res = await fetch(`${ELEVEN_BASE}/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `ElevenLabs HTTP ${res.status}: ${errText}` };
  }

  const contentType = res.headers.get("content-type") ?? "audio/mpeg";
  const audioBuffer = await res.arrayBuffer();
  return { ok: true, audioBuffer, contentType };
}
