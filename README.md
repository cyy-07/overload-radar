# Overload Radar

Overload Radar is a cognitive load and decision simulation system for students.
It is not a chatbot, planner, or generic productivity app. The product thesis is:

- model uncertain workload, not fixed checklists
- compare futures, not just give advice
- help users decide what to cut, not how to do more
- offer optional AI-generated comfort voice support during overload moments

## Local Setup

1. Create `.env.local` in the repo root if it does not already exist.
2. Copy the placeholder keys from `.env.local.example`.
3. Paste your real keys manually. Do not commit secrets.

Expected variables:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash-8b
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_CALM_VOICE_ID=
ELEVENLABS_EMERGENCY_VOICE_ID=
```

Windows PowerShell helper:

```powershell
Set-Location "C:\Users\lbd\Desktop\1\overload-radar"
if (!(Test-Path ".env.local")) { New-Item ".env.local" -ItemType File -Force }
```

## Runtime Notes

- Frontend calls backend APIs only.
- Gemini runs as the analysis engine on the server.
- ElevenLabs runs as the voice layer on the server.
- AI Studio is for prompt testing and key management only, not runtime UX.

## Run Locally

1. Install dependencies:

```powershell
Set-Location "C:\Users\lbd\Desktop\1\overload-radar"
npm install
```

2. Start the dev server:

```powershell
npm run dev
```

3. Open the app in the browser:

```text
http://localhost:3000
```

4. Production verification:

```powershell
npm run typecheck
npm run build
```

## What To Test First

1. Paste or keep the demo workload input.
2. Click `Analyze Overload Risk`.
3. Confirm the UI renders:
   - risk score
   - summary
   - cut recommendations
   - stress before / after
   - Plan A / B / C
   - differentiation points
4. Check the calm voice button.
5. Check the emergency comfort voice button after enabling consent.

## Fallback Behavior

- If Gemini fails or `GEMINI_API_KEY` is missing, analysis falls back to deterministic mock data.
- If ElevenLabs fails or `ELEVENLABS_API_KEY` is missing, voice falls back to mock audio so the demo flow does not break.
