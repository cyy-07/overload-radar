import { NextResponse } from "next/server";
import { generateCoachAudio } from "@/services/voice/voice.generator";

export const runtime = "nodejs";

type VoiceMode = "calm" | "emergency";

function createMockAudioDataUrl() {
  // 0.25s silent WAV to keep the demo flow playable even when ElevenLabs is unavailable.
  const sampleRate = 8000;
  const durationSeconds = 0.25;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

export async function POST(req: Request) {
  let body: {
    voice_script?: string;
    mode?: VoiceMode;
    consent?: boolean;
  };
  try {
    body = (await req.json()) as {
      voice_script?: string;
      mode?: VoiceMode;
      consent?: boolean;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const script = String(body.voice_script ?? "").trim();
  if (!script) {
    return NextResponse.json({ error: "voice_script is required" }, { status: 400 });
  }
  if (!body.consent) {
    return NextResponse.json(
      { error: "Voice playback requires explicit opt-in consent." },
      { status: 400 }
    );
  }

  const mode = body.mode === "emergency" ? "emergency" : "calm";
  const voiceId =
    mode === "emergency"
      ? process.env.ELEVENLABS_EMERGENCY_VOICE_ID ||
        process.env.ELEVENLABS_VOICE_ID ||
        process.env.ELEVENLABS_CALM_VOICE_ID
      : process.env.ELEVENLABS_CALM_VOICE_ID || process.env.ELEVENLABS_VOICE_ID;

  const tts = await generateCoachAudio(
    { voiceScript: script, voiceId },
    {
      apiKey: process.env.ELEVENLABS_API_KEY,
      defaultVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM",
    }
  );

  if (!tts.ok) {
    return NextResponse.json({
      audio_url: createMockAudioDataUrl(),
      mode,
      used_mock: true,
      hint: tts.error,
      ai_label: "AI-generated comfort support (mock audio fallback)",
    });
  }

  const base64 = Buffer.from(tts.audioBuffer).toString("base64");
  const mime = tts.contentType.includes("mpeg") ? "audio/mpeg" : tts.contentType;
  const audio_url = `data:${mime};base64,${base64}`;

  return NextResponse.json({
    audio_url,
    mode,
    used_mock: false,
    ai_label: "AI-generated comfort support",
  });
}
