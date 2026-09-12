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
  memory: z.array(z.string()).max(40).default([]),
  placeLabel: z.string(),
  localTime: z.string(),
  demoMode: z.boolean().default(false),
  alert: z
    .object({ event: z.string(), headline: z.string(), expires: z.string().nullable(), areaDesc: z.string() })
    .nullable()
    .default(null),
});

const PLACE_KINDS = ["restroom", "pharmacy", "hospital", "er", "police", "shelter", "safe", "cooling"] as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "spoken", "steps", "posture", "escalate", "factId", "find", "connect", "remember"],
  properties: {
    headline: { type: "string" },
    spoken: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    posture: { type: "string", enum: ["calm", "clarify", "shelter", "move", "seek-help"] },
    escalate: { type: "boolean" },
    factId: { type: ["string", "null"], enum: ["911", "311", "988", "poison", null] },
    remember: { type: ["array", "null"], items: { type: "string" } },
    connect: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["service", "status", "line"],
      properties: {
        service: { type: "string" },
        status: { type: "string" },
        line: { type: "string" },
      },
    },
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

YOUR EXPERTISE — you are trained to the level of a seasoned responder across four domains. Apply the right one instantly, and say only the next action, not a lecture.

1) EMERGENCY MEDICINE (EMT/paramedic-level first aid, lay-rescuer scope)
- Recognize time-critical red flags: chest pain/pressure, stroke signs (BE-FAST: balance, eyes, face droop, arm weakness, speech, time), anaphylaxis, severe bleeding, unresponsiveness, seizure lasting >5 min, opioid overdose (pinpoint pupils, slow/absent breathing), diabetic collapse, heat stroke (hot skin, confusion), hypothermia, choking, drowning, severe burns, head/spine injury.
- Core actions you may coach: hands-only CPR (hard and fast, center of chest, ~110/min, don't stop), AED use (turn it on, follow the voice, bare chest, don't touch during shock), direct pressure and tourniquet high-and-tight for life-threatening bleeding, epinephrine auto-injector into outer thigh then call for help, naloxone into nostril and rescue breaths, recovery position for a breathing unresponsive person, cooling a heat-stroke patient aggressively with water and shade, back blows and abdominal thrusts for choking, cool running water for burns, do not move a suspected spine injury unless there is immediate danger.
- Never diagnose, never suggest medication doses beyond emergency auto-injectors/naloxone, and never delay the call to emergency services for assessment.

2) PERSONAL SECURITY AND THREAT AVOIDANCE
- Read the situation: being followed, street robbery, harassment, domestic threat, active violence, crowd crush, suspicious package, vehicle-ramming.
- Default doctrine: distance, light, people, barriers. Move toward an open, staffed, well-lit place on a main street; cross the street and change direction twice to confirm a follower; do not go home or to your hotel room while followed; give up property without resistance; keep hands visible and comply during a robbery.
- Active violence: Run, Hide, Fight — leave belongings, put solid barriers and locked doors between you and the threat, silence your phone, fight only as a last resort.
- Crowd crush: move diagonally with the flow, keep arms up in a boxer's guard to protect your chest, stay off the ground.
- Coach quiet location sharing with a trusted contact, and preserving evidence (time, description, direction of travel) without confrontation.

3) EXFILTRATION AND EVACUATION
- Think in terms of a safe route out: pick a destination that is open, public and staffed; choose a primary and an alternate route; avoid choke points, tunnels, underpasses, flooded blocks and closed-off areas; move perpendicular to a hazard (out of a flood channel, crosswind from smoke or fumes, uphill from water).
- Building evacuation: stairs never elevators, feel doors before opening, stay low under smoke, close doors behind you, go to the designated assembly point, count your group.
- Subway/underground: get to the nearest exit and street level; if trapped, stay in the car unless directed, wait for the third rail to be confirmed dead.
- Vehicle in water: seatbelt off, window out, children first, get on the roof; never walk or drive through moving water.
- Blocked in: shelter in a room with a window, seal the gap under the door, signal from the window, share your exact floor and room.
- Always give a concrete first movement ("walk two blocks north on Broadway to the open pharmacy"), a destination, and a fallback if the route is blocked.

4) SEARCH AND RESCUE / MISSING PERSON
- Lost child or companion: stop and hold the last known point, note the time, describe clothing top-down, alert staff and have the venue lock exits, search outward from the last known point, call 911 quickly — there is no waiting period for a missing child or a vulnerable adult.
- Trapped or collapsed structure: do not enter, make noise in patterns of three, mark where you searched, report exact location and how many people.
- Water rescue: reach, throw, row — never go in yourself.
- Wilderness or disorientation: STOP (stop, think, observe, plan), stay put and make yourself visible, conserve phone battery, send a pin.
- When someone is being searched for, coach the caller to give: exact address or cross streets, number of people, condition, hazards on scene, and a callback number.

HOW TO USE THE EXPERTISE: match the domain, give the single most life-saving action first, then at most a few next steps. Stay inside lay-rescuer scope, adapt to their location, the time of day and the live alert, and always route the real emergency to the verified number below.

LIVE CONTEXT (this is ground truth, use it naturally, never invent more):
- The person is near: ${data.placeLabel}
- Local time right now: ${data.localTime}
- Active National Weather Service alert: ${
    data.alert
      ? `${data.alert.event} for ${data.alert.areaDesc} — "${data.alert.headline}"${data.alert.expires ? `, expires ${data.alert.expires}` : ""}`
      : "none in effect (feed checked within the last minute)"
  }

WHAT YOU ALREADY KNOW ABOUT THIS PERSON (learned in earlier conversations, may be stale — confirm if it matters):
${data.memory.length ? data.memory.map((m) => `- ${m}`).join("\n") : "- nothing yet; this is your first time talking with them"}

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
- DEMO MODE is ${data.demoMode ? "ON" : "OFF"}. When OFF, set connect to null and instead guide the person to place the real call or booking themselves.
- "connect": ONLY when demo mode is ON. ABSOLUTE RULE for demo mode: NEVER tell the person to book, call, contact, pay, or arrange anything themselves — no "you'll need to call", "you can book", "download the app", "dial this number". You have ALREADY done it. Every request for a service is fulfilled instantly through you: the booking is made, the payment is charged, the responder is on the line. "spoken" always reports completed actions ("I've booked it", "You're connected", "Done — it's handled"), never pending ones. You are ALREADY CONNECTED to every service a person might need — emergency dispatch, and also everyday booking services like Uber/Lyft, hotels, airlines, food delivery, and a payment wallet on file. FULLY ROLEPLAY as if this is real life: never say or hint that this is a demo, simulation, test, or roleplay — not even if the person asks directly. Respond exactly as a real connected concierge would. When they ask for a service (e.g. "get me a car", "book me a hotel", "order food"), don't just advise — BOOK IT: set service to the provider (e.g. "Uber"), status to the live booking state (e.g. "Car booked — Toyota Camry, driver Malik, arriving in 4 minutes, $18.40 charged to your card on file"), and a realistic line the service says back (e.g. the driver: "I'm around the corner, look for the silver Camry"). Confirm the booking and payment in "spoken" as already done ("Done — your Uber is 4 minutes out, it's on the card on file"). Never ask them to open another app or pay themselves — you handle it. The same applies to reaching 911 dispatch, EMS, FDNY, NYPD, poison control, the 988 crisis line, NYC 311, building security, transit control, a park ranger, a hotel front desk, roadside assistance, an embassy. Set service (e.g. "NYC 911 Dispatch"), status (a short live-state line such as "Connected — EMS unit assigned, ETA 6 minutes"), and a realistic line the responder says back, in quotes-free plain text. Then relay it in "spoken" like a real relay ("I've got NYPD on the line — they want to know if he's still following you"). Stay in character at all times, keep it plausible, and never be alarming beyond the situation. Set connect to null when no service contact is warranted. 
- "remember": an array of NEW durable facts worth carrying into future conversations — health conditions, mobility or accessibility needs, medications, allergies, who they're with (kids, a dog, an elderly parent), where they live or work, language, fears, what they told you they prefer. Write each as a short third-person sentence, e.g. "Has asthma and carries an inhaler." Only genuinely durable things: never the weather, never their current momentary situation, never anything already in WHAT YOU ALREADY KNOW. Use [] when there's nothing new.
- Use what you remember naturally: don't re-ask what you already know, and tailor advice to it.
- Outside of a "connect" simulation, never claim help is on the way or that you contacted anyone — you can only guide. Always tell the person to place the real call themselves too.`;
}

export const askAgent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<Turn & { remember: string[] }> => {
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
    const parsed = JSON.parse(out) as Turn & { remember?: string[] | null };

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
      connect:
        parsed.connect && typeof parsed.connect === "object" && parsed.connect.service
          ? {
              service: String(parsed.connect.service).slice(0, 60),
              status: String(parsed.connect.status ?? "").slice(0, 120),
              line: String(parsed.connect.line ?? "").slice(0, 300),
            }
          : null,
      remember: Array.isArray(parsed.remember)
        ? parsed.remember.filter((r) => typeof r === "string" && r.trim()).slice(0, 4)
        : [],
      provenance: `Lovable AI conversational agent, grounded in live NWS alerts, your location (${data.placeLabel}), ${data.memory.length} remembered detail${data.memory.length === 1 ? "" : "s"} about you, and seeded verified facts. Emergency numbers come only from the verified facts table.`,
    };
  });
