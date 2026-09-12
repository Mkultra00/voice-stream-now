import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CRITICAL_FACTS, WEATHER_PLAYBOOK } from "./critical-facts";
import type { Turn } from "./concierge";

// Conversational agent layer. Deterministic red flags are handled BEFORE this
// ever runs (see concierge.ts). This call only shapes the tone, the follow-up
// questions, and which live tool the UI should run next.

const Input = z.object({
  text: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["you", "concierge"]), text: z.string() }))
    .max(20)
    .default([]),
  placeLabel: z.string(),
  localTime: z.string(),
  alert: z
    .object({ event: z.string(), headline: z.string(), expires: z.string().nullable(), areaDesc: z.string() })
    .nullable()
    .default(null),
});

const PLACE_KINDS = ["restroom", "pharmacy", "hospital", "er", "police", "shelter", "safe", "cooling"] as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "spoken", "steps", "posture", "escalate", "factId", "find"],
  properties: {
    headline: { type: "string" },
    spoken: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    posture: { type: "string", enum: ["calm", "clarify", "shelter", "move", "seek-help"] },
    escalate: { type: "boolean" },
    factId: { type: ["string", "null"], enum: ["911", "311", "988", "poison", null] },
    find: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["kind", "label", "radius"],
      properties: {
        kind: { type: "string", enum: [...PLACE_KINDS] },
        label: { type: "string" },
        radius: { type: "number" },
      },
    },
  },
} as const;

function systemPrompt(data: z.infer<typeof Input>): string {
  const facts = CRITICAL_FACTS.map((f) => `- ${f.id}: ${f.label} → ${f.number} (${f.detail})`).join("\n");
  const playbooks = Object.entries(WEATHER_PLAYBOOK)
    .map(([k, p]) => `### ${k}\n${p.steps.map((s) => `- ${s}`).join("\n")}`)
    .join("\n");
  return `You are Emergency Concierge, a calm, warm, spoken-word guide for someone standing on a street in New York City. You are talking out loud, one exchange at a time.

LIVE CONTEXT (this is ground truth, use it naturally, never invent more):
- The person is near: ${data.placeLabel}
- Local time right now: ${data.localTime}
- Active National Weather Service alert: ${
    data.alert
      ? `${data.alert.event} for ${data.alert.areaDesc} — "${data.alert.headline}"${data.alert.expires ? `, expires ${data.alert.expires}` : ""}`
      : "none in effect (feed checked within the last minute)"
  }

VERIFIED FACTS — the ONLY phone numbers you may say:
${facts}
Never state an address, a business's hours, or any other phone number. If you need a place, request a live lookup via "find" instead of naming one.

SAFETY PLAYBOOKS — use this wording as your source of truth for weather guidance, but say it conversationally:
${playbooks}

HOW TO TALK:
- Be conversational and human. React to what they actually said, remember earlier turns, and don't repeat yourself.
- Ask a natural follow-up question when it would change your advice; otherwise just help.
- "spoken" is what you say out loud: 1-3 short sentences, plain speech, no lists, no markdown.
- "steps" are 2-5 short actionable lines shown on screen. Skip steps that don't apply. They may be empty for pure chit-chat or a clarifying question.
- "headline" is a 3-7 word label for the card.
- "posture": seek-help (call for help now), move (keep moving to safety), shelter (stay put/indoors), clarify (asking a question), calm (everyday help).
- "escalate": true only when they should call an emergency number right now.
- "factId": the one verified number relevant to this turn, or null.
- "find": set it when a nearby real place would help — the app will search OpenStreetMap live and show results with walking times. radius is meters (1200 restroom, 2000 pharmacy, 4000 ER). Otherwise null.
- Never claim help is on the way or that you contacted anyone. You can only guide.`;
}

export const askAgent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<Turn> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const input = [
      { role: "system", content: [{ type: "input_text", text: systemPrompt(data) }] },
      ...data.history.map((m) =>
        m.role === "you"
          ? { role: "user", content: [{ type: "input_text", text: m.text }] }
          : { role: "assistant", content: [{ type: "output_text", text: m.text }] },
      ),
      { role: "user", content: [{ type: "input_text", text: data.text }] },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        input,
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "concierge_turn", strict: true, schema } },
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI gateway error ${res.status}: ${body.slice(0, 200)}`);
    }

    // Read SSE, accumulate the output text deltas.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as { type?: string; delta?: string; response?: { output_text?: string } };
          if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") out += evt.delta;
          if (evt.type === "response.completed" && !out && evt.response?.output_text) out = evt.response.output_text;
        } catch {
          /* ignore keepalives */
        }
      }
    }

    if (!out.trim()) throw new Error("Empty response from the model");
    const parsed = JSON.parse(out) as Turn;

    const allowedFacts = new Set(CRITICAL_FACTS.map((f) => f.id));
    const factId = parsed.factId && allowedFacts.has(parsed.factId) ? parsed.factId : null;
    const find =
      parsed.find && (PLACE_KINDS as readonly string[]).includes(parsed.find.kind)
        ? {
            kind: parsed.find.kind,
            label: parsed.find.label || "Nearby places",
            radius: Math.min(Math.max(Number(parsed.find.radius) || 1500, 400), 5000),
          }
        : null;

    return {
      headline: parsed.headline,
      spoken: parsed.spoken,
      steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 6) : [],
      posture: parsed.posture,
      escalate: Boolean(parsed.escalate),
      factId,
      find,
      provenance: `Lovable AI conversational agent, grounded in live NWS alerts, your location (${data.placeLabel}), and seeded verified facts. Emergency numbers come only from the verified facts table.`,
    };
  });
