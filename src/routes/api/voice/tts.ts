import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Calm, clear voice for spoken guidance (Sarah).
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

const schema = z.object({ text: z.string().min(1).max(2500) });

export const Route = createFileRoute("/api/voice/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["ELEVENLABS_API_KEY"];
        if (!apiKey) {
          return new Response("Voice service is not connected.", { status: 503 });
        }

        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return new Response("Invalid request.", { status: 400 });
        }

        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              text: parsed.data.text,
              model_id: "eleven_turbo_v2_5",
              voice_settings: { stability: 0.6, similarity_boost: 0.75, speed: 1.0 },
            }),
          },
        );

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          console.error(`ElevenLabs TTS failed [${res.status}]: ${detail}`);
          return new Response(`Speech failed (${res.status}). ${detail}`, { status: res.status });
        }

        return new Response(res.body, { headers: { "content-type": "audio/mpeg" } });
      },
    },
  },
});
