import { synthesizeSpeech } from "./elevenlabs.service";

export type VoiceGenerationInput = {
  voiceScript: string;
  voiceId?: string;
};

/**
 * Thin adapter: turns finalized copy into audio bytes. No domain logic.
 */
export async function generateCoachAudio(
  input: VoiceGenerationInput,
  env: { apiKey: string | undefined; defaultVoiceId: string }
) {
  if (!env.apiKey) {
    return { ok: false as const, error: "Missing ELEVENLABS_API_KEY" };
  }

  const voiceId = input.voiceId ?? env.defaultVoiceId;
  return synthesizeSpeech({
    apiKey: env.apiKey,
    voiceId,
    text: input.voiceScript,
  });
}
