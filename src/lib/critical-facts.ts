// SEEDED CRITICAL FACTS — the only source the app may cite for emergency
// numbers and official addresses. The model/logic layer never invents these.
// Verified against official sources on the date below.

export const FACTS_VERIFIED_ON = "2026-09-12";

export type CriticalFact = {
  id: string;
  label: string;
  number: string;
  detail: string;
  source: string;
};

export const CRITICAL_FACTS: CriticalFact[] = [
  {
    id: "911",
    label: "Emergency (police, fire, medical)",
    number: "911",
    detail: "Text-to-911 is available in New York City.",
    source: "NYC.gov / NYPD",
  },
  {
    id: "311",
    label: "City services & non-emergency",
    number: "311",
    detail: "Flooding, downed trees, heat complaints, shelter info.",
    source: "NYC 311",
  },
  {
    id: "988",
    label: "Suicide & Crisis Lifeline",
    number: "988",
    detail: "24/7 call or text.",
    source: "SAMHSA",
  },
  {
    id: "poison",
    label: "NYC Poison Control",
    number: "212-764-7667",
    detail: "24/7 poisoning and overdose guidance.",
    source: "NYC Health",
  },
];

export type Posture = "calm" | "clarify" | "shelter" | "move" | "seek-help";

export const POSTURE_LABEL: Record<Posture, string> = {
  calm: "ALL CLEAR",
  clarify: "CLARIFY",
  shelter: "SHELTER",
  move: "MOVE",
  "seek-help": "SEEK HELP NOW",
};

// Deterministic red-flag rules. A hit here bypasses any language model and
// returns a seeded escalation card directly.
export type RedFlag = {
  id: string;
  patterns: RegExp;
  headline: string;
  spoken: string;
  steps: string[];
  factId: string;
  findKind: "er" | "police";
  posture: Posture;
};

export const RED_FLAGS: RedFlag[] = [
  {
    id: "cardiac",
    patterns:
      /(chest (pain|pressure|tight)|arm (is )?numb|can'?t breathe|cannot breathe|trouble breathing|heart attack|stroke|face droop|slurred speech)/i,
    headline: "Call 911 now — possible medical emergency",
    spoken:
      "Call 911 now. Sit down, stay still, and unlock your door so responders can reach you. Do not drive yourself.",
    steps: [
      "Call 911 now and say your location first.",
      "Sit or lie down. Do not walk or drive yourself.",
      "Unlock the door so responders can get in.",
      "If you have aspirin and are not allergic, tell the 911 dispatcher — follow their instruction.",
    ],
    factId: "911",
    findKind: "er",
    posture: "seek-help",
  },
  {
    id: "bleeding",
    patterns: /(bleeding badly|won'?t stop bleeding|severe bleeding|stabbed|gunshot|shot me|unconscious|not breathing)/i,
    headline: "Call 911 now — severe injury",
    spoken:
      "Call 911 now. Press hard on the wound with cloth and keep pressing. Do not remove anything stuck in the wound.",
    steps: [
      "Call 911 now and give your location first.",
      "Press firmly on the wound with any clean cloth.",
      "Keep pressure on — do not lift to check.",
      "Keep the person warm and still until help arrives.",
    ],
    factId: "911",
    findKind: "er",
    posture: "seek-help",
  },
  {
    id: "following",
    patterns: /(being followed|someone'?s following|following me|stalking me|i'?m scared of (a|the) (man|person|guy)|threatening me)/i,
    headline: "Head to a staffed, open location",
    spoken:
      "Keep moving toward people and light. I'm routing you to the nearest open, staffed place. Do not go home.",
    steps: [
      "Keep moving. Do not stop and do not go home.",
      "Walk toward the nearest open, staffed place below.",
      "Stay on lit main avenues, not side streets.",
      "Share your location with someone you trust, or call 911.",
    ],
    factId: "911",
    findKind: "police",
    posture: "move",
  },
  {
    id: "crisis",
    patterns: /(kill myself|suicid|end my life|hurt myself|want to die)/i,
    headline: "You can talk to someone right now — 988",
    spoken:
      "You don't have to handle this alone. The 988 Lifeline is free, 24/7, and you can call or text it right now.",
    steps: [
      "Call or text 988 — it is free and confidential, 24/7.",
      "Stay with someone, or move to a public place.",
      "If you are in immediate danger, call 911.",
    ],
    factId: "988",
    findKind: "er",
    posture: "seek-help",
  },
];

// Seeded playbooks. The wording below is fixed content, not generated.
export const WEATHER_PLAYBOOK: Record<string, { spoken: string; steps: string[] }> = {
  flood: {
    spoken:
      "Get indoors and go up, not down. Do not enter the subway, basements, or underpasses, and never walk into moving water.",
    steps: [
      "Move indoors and to a higher floor if you can.",
      "Do not enter the subway, a basement, or an underpass.",
      "Never walk or drive through moving water — six inches can knock you down.",
      "Stay off the street until the warning expires.",
    ],
  },
  heat: {
    spoken:
      "Get out of the sun and into air conditioning. Drink water now, and check on anyone older nearby.",
    steps: [
      "Move into air conditioning — a library, lobby, or cooling center.",
      "Drink water now, even if you are not thirsty.",
      "Skip strenuous activity until after sunset.",
      "Check on older neighbors and anyone without AC.",
    ],
  },
  tornado: {
    spoken:
      "Get to the lowest interior room away from windows, right now, and stay there until the warning expires.",
    steps: [
      "Go to the lowest floor, interior room, away from all windows.",
      "Do not stay in a vehicle or under an overpass.",
      "Cover your head and neck.",
      "Stay put until the warning expires, not until it looks calm.",
    ],
  },
  generic: {
    spoken: "Get indoors, stay off the street, and wait for the warning to expire.",
    steps: [
      "Move indoors to a safe, sturdy building.",
      "Stay off the street and away from windows.",
      "Keep your phone charged and this page open.",
    ],
  },
};

export function playbookKeyFor(event: string): keyof typeof WEATHER_PLAYBOOK {
  const e = event.toLowerCase();
  if (e.includes("flood")) return "flood";
  if (e.includes("heat")) return "heat";
  if (e.includes("tornado")) return "tornado";
  return "generic";
}
