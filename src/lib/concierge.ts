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

export function respond(text: string, activeAlert: LiveAlert | null): Turn {
  const clean = text.trim();

  // 1. Deterministic red flags run before anything else.
  for (const flag of RED_FLAGS) {
    if (flag.patterns.test(clean)) {
      const fact = CRITICAL_FACTS.find((f) => f.id === flag.factId)!;
      return {
        headline: flag.headline,
        spoken: flag.spoken,
        steps: flag.steps,
        posture: flag.posture,
        escalate: true,
        factId: flag.factId,
        find: { kind: flag.findKind, label: flag.findKind === "er" ? "Nearest emergency departments" : "Open, staffed locations", radius: 4000 },
        provenance: `Red-flag rule "${flag.id}" — no language model involved. ${fact.number} from seeded critical facts.`,
      };
    }
  }

  // 2. Active warning + a "what do I do" question -> seeded weather playbook.
  if (activeAlert && HELP_NOW.test(clean)) {
    const play = WEATHER_PLAYBOOK[playbookKeyFor(activeAlert.event)] ?? WEATHER_PLAYBOOK["generic"]!;
    return {
      headline: `${activeAlert.event}: stay off the street`,
      spoken: play.spoken,
      steps: play.steps,
      posture: playbookKeyFor(activeAlert.event) === "flood" ? "shelter" : "shelter",
      escalate: false,
      factId: null,
      find: { kind: "shelter", label: "Indoor public spaces near you", radius: 1200 },
      provenance: `Seeded weather playbook for "${activeAlert.event}" + live NWS alert.`,
    };
  }

  // 3. Everyday valet: nearby places from OpenStreetMap.
  for (const intent of PLACE_INTENTS) {
    if (intent.patterns.test(clean)) {
      const openNow = /(open|right now|after midnight|24 ?hour|late)/i.test(clean);
      return {
        headline: intent.label + " near you",
        spoken: `Looking for the closest ${intent.label.toLowerCase()}${openNow ? " that should be open" : ""}. Here's what's nearest.`,
        steps: [],
        posture: "calm",
        escalate: false,
        factId: null,
        find: { kind: intent.kind, label: intent.label, radius: intent.radius },
        provenance: "OpenStreetMap via Overpass, ranked by walking distance.",
      };
    }
  }

  // 4. Nothing matched — ask one clarifying question, never guess.
  return {
    headline: "I need one detail",
    spoken:
      "I can help with what's near you, the weather warnings in effect, or an emergency. Which one is it right now?",
    steps: [
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
