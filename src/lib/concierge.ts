import type { LiveAlert } from "./alerts.functions";
import type { PlaceKind } from "./places.functions";
import {
  RED_FLAGS,
  WEATHER_PLAYBOOK,
  playbookKeyFor,
  type Posture,
  CRITICAL_FACTS,
} from "./critical-facts";

export type Turn = {
  headline: string;
  spoken: string;
  steps: string[];
  posture: Posture;
  escalate: boolean;
  factId: string | null;
  find: { kind: PlaceKind; label: string; radius: number } | null;
  provenance: string;
};

const PLACE_INTENTS: { patterns: RegExp; kind: PlaceKind; label: string; radius: number }[] = [
  { patterns: /(restroom|bathroom|toilet|washroom)/i, kind: "restroom", label: "Public restrooms", radius: 1200 },
  { patterns: /(pharmac|drug ?store|prescription|cvs|walgreens|duane reade)/i, kind: "pharmacy", label: "Pharmacies", radius: 2000 },
  { patterns: /(emergency room|\ber\b|urgent care|hospital)/i, kind: "er", label: "Emergency departments", radius: 4000 },
  { patterns: /(police|precinct|cop)/i, kind: "police", label: "Police stations", radius: 3000 },
  { patterns: /(cool|air ?condition|ac |heat relief|cooling center)/i, kind: "cooling", label: "Indoor cool spaces", radius: 1500 },
  { patterns: /(shelter|somewhere indoors|indoor|get inside|library)/i, kind: "shelter", label: "Indoor public spaces", radius: 1500 },
  { patterns: /(safe place|somewhere safe|staffed|open place|hotel lobby)/i, kind: "safe", label: "Open, staffed locations", radius: 1500 },
];

const HELP_NOW = /(what should i do|what do i do|help me|i'?m on the street|what now|next step)/i;
const WEATHER_TOPIC = /(flood|storm|hurricane|tornado|blizzard|thunderstorm|heat wave|heat|warning|weather|rain|wind|snow)/i;

function expiryLine(alert: LiveAlert): string | null {
  if (!alert.expires) return null;
  const ms = new Date(alert.expires).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.round(ms / 60_000);
  const clock = new Date(alert.expires).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const span = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
  return `Timing: this ${alert.event.toLowerCase()} is in effect for the next ${span} (until ${clock}).`;
}

function alertHeadline(alert: LiveAlert): string | null {
  const h = alert.headline?.trim();
  return h ? `Official word: ${h}` : null;
}

export type Context = {
  placeLabel: string | null;
  hour: number;
};

function timePhrase(hour: number): string {
  if (hour < 5) return "the middle of the night";
  if (hour < 11) return "the morning";
  if (hour < 17) return "the afternoon";
  if (hour < 21) return "the evening";
  return "late at night";
}

function clockPhrase(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? "a.m." : "p.m."}`;
}

function where(ctx: Context): string {
  return ctx.placeLabel && ctx.placeLabel !== "locating…" ? ctx.placeLabel : "your location";
}

/** Deterministic red flags — these always bypass the language model. */
export function redFlagTurn(text: string, ctx: Context): Turn | null {
  const clean = text.trim();
  const here = where(ctx);
  for (const flag of RED_FLAGS) {
    if (flag.patterns.test(clean)) {
      const fact = CRITICAL_FACTS.find((f) => f.id === flag.factId)!;
      return {
        headline: flag.headline,
        spoken: flag.spoken,
        steps: [...flag.steps, `Your location: ${here} — give this to the 911 operator.`],
        posture: flag.posture,
        escalate: true,
        factId: flag.factId,
        find: { kind: flag.findKind, label: flag.findKind === "er" ? "Nearest emergency departments" : "Open, staffed locations", radius: 4000 },
        provenance: `Red-flag rule "${flag.id}" — no language model involved. ${fact.number} from seeded critical facts.`,
      };
    }
  }

  // 2. Active warning + a "what do I do" / weather question -> seeded playbook.
  if (activeAlert && (HELP_NOW.test(clean) || WEATHER_TOPIC.test(clean))) {
    const key = playbookKeyFor(activeAlert.event);
    const play = WEATHER_PLAYBOOK[key] ?? WEATHER_PLAYBOOK["generic"]!;
    const service = CRITICAL_FACTS.find((f) => f.id === play.serviceFact)!;
    const timing = expiryLine(activeAlert);
    const steps = [
      timing,
      ...play.steps,
      alertHeadline(activeAlert),
      `Context: ${activeAlert.event} is in effect where you are now (${here}), checked live within the last minute.`,
    ].filter((s): s is string => Boolean(s));
    return {
      headline: `${activeAlert.event}: ${play.now}`,
      spoken: `${activeAlert.event} is in effect right now near ${here}. ${play.spoken}${timing ? ` It runs for the next ${timing.split("next ")[1]?.split(" (")[0] ?? "short while"}.` : ""}`,
      steps,
      posture: "shelter",
      escalate: false,
      factId: play.serviceFact,
      find: { kind: play.placeKind, label: play.placeLabel, radius: 1500 },
      provenance: `Seeded ${key} playbook + live NWS alert (${activeAlert.source}). ${service.number} from verified critical facts.`,
    };
  }

  // 2b. Weather question with no active warning — say so, with prep tips.
  if (!activeAlert && WEATHER_TOPIC.test(clean)) {
    return {
      headline: `No active weather warning near ${here}`,
      spoken:
        `I just checked the National Weather Service feed for ${here}: no warning is in effect at this hour. I'll keep watching it, and if one is issued I'll say so immediately.`,
      steps: [
        `Live check: no NWS warning covers ${here} right now.`,
        "This page re-checks the official feed every 60 seconds — a new warning appears automatically.",
        `It's ${clockPhrase(ctx.hour)} — normal travel is fine; just keep an eye on the sky if rain is forecast.`,
        "For non-emergency city services (flooding, heat, shelter info), call 311.",
      ],
      posture: "calm",
      escalate: false,
      factId: "311",
      find: null,
      provenance: "Live NWS alert check returned no active warnings; 311 from verified critical facts.",
    };
  }

  // 3. Everyday valet: nearby places from OpenStreetMap.
  for (const intent of PLACE_INTENTS) {
    if (intent.patterns.test(clean)) {
      const openNow = late || /(open|right now|after midnight|24 ?hour|late)/i.test(clean);
      return {
        headline: `${intent.label} near ${here}`,
        spoken:
          `It's ${clockPhrase(ctx.hour)} — ${timePhrase(ctx.hour)} near ${here}. ` +
          `Here are the closest ${intent.label.toLowerCase()}${openNow ? ", prioritizing ones that should be open at this hour" : ""}, ranked by walking time from where you're standing.`,
        steps: [
          `Context: ${clockPhrase(ctx.hour)}, near ${here}.`,
          ...(late ? ["It's late — some smaller places may be closed; 24-hour options are listed first."] : []),
        ],
        posture: "calm",
        escalate: false,
        factId: null,
        find: { kind: intent.kind, label: intent.label, radius: intent.radius },
        provenance: `OpenStreetMap via Overpass, ranked by walking distance from ${here}.`,
      };
    }
  }

  // 4. Nothing matched — ask one clarifying question, never guess.
  return {
    headline: "I need one detail",
    spoken:
      `I can see it's ${clockPhrase(ctx.hour)} and you're near ${here}${activeAlert ? `, with a ${activeAlert.event.toLowerCase()} in effect` : ", with no weather warning in effect"}. Tell me what's happening — a place you need, the weather, or an emergency — and I'll act on it.`,
    steps: [
      `Context I already have: ${clockPhrase(ctx.hour)}, near ${here}${activeAlert ? `, active alert: ${activeAlert.event}` : ", no active weather warning"}.`,
      "Say what you need: a restroom, a pharmacy, an ER, or a safe place.",
      "Or say what's happening and I'll take it from there.",
    ],
    posture: "clarify",
    escalate: false,
    factId: null,
    find: null,
    provenance: "No rule matched — the app asks instead of guessing.",
  };
}

export function postureFromAlerts(alerts: LiveAlert[]): Posture {
  if (alerts.length === 0) return "calm";
  const severe = alerts.some((a) => /warning/i.test(a.event));
  return severe ? "shelter" : "clarify";
}
