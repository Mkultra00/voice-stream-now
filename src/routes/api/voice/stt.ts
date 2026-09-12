import { createFileRoute } from "@tanstack/react-router";

// Proxies ElevenLabs speech-to-text so the API key stays server-side.
export const Route = createFileRoute("/api/voice/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["ELEVENLABS_API_KEY"];
        if (!apiKey) {
          return json({ error: "Voice service is not connected." }, 503);
        }

        const inbound = await request.formData();
        const file = inbound.get("audio");
        if (!(file instanceof File) || file.size < 2048) {
          return json({ error: "That recording was empty — please try again." }, 400);
        }
        if (file.size > 20 * 1024 * 1024) {
          return json({ error: "Recording too long." }, 413);
        }

        const body = new FormData();
        body.append("file", file, file.name || "recording.wav");
        body.append("model_id", "scribe_v2");
        body.append("language_code", "eng");

        const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": apiKey },
          body,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          console.error(`ElevenLabs STT failed [${res.status}]: ${detail}`);
          return json({ error: `Transcription failed (${res.status}).`, detail }, res.status);
        }

        const data = (await res.json()) as { text?: string };
        return json({ text: (data.text ?? "").trim() }, 200);
      },
    },
  },
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
