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
export type Playbook = {
  spoken: string;
  steps: string[];
  /** one short "do this now" line shown as the headline action */
  now: string;
  /** verified fact id for the follow-up city services line */
  serviceFact: string;
  placeKind: "shelter" | "cooling";
  placeLabel: string;
};

export const WEATHER_PLAYBOOK: Record<string, Playbook> = {
  flood: {
    now: "Get indoors and up — not down.",
    spoken:
      "Get indoors and go up, not down. Do not enter the subway, a basement, or an underpass, and never walk into moving water. Six inches of moving water can knock you down; two feet can carry a car away.",
    steps: [
      "Right now: move indoors and to a higher floor. Basements and ground floors flood first.",
      "Stay out of the subway — stations and tunnels flood fast and pumps get overwhelmed.",
      "Never walk or drive through moving water. Six inches can knock you down, two feet can float a car.",
      "Avoid underpasses, under-elevated tracks, and low intersections — they fill first.",
      "If water rises around you and you cannot get above it, call 911 and tell them you are trapped.",
      "If your building floods or you need shelter info, call 311.",
    ],
    serviceFact: "311",
    placeKind: "shelter",
    placeLabel: "Indoor, above-ground places near you",
  },
  heat: {
    now: "Get into air conditioning within the next 30 minutes.",
    spoken:
      "Get out of the sun and into air conditioning as soon as you can. Drink water now, even if you are not thirsty. If you feel dizzy, confused, or stop sweating, that is heat stroke — call 911.",
    steps: [
      "Right now: head to the nearest air-conditioned place below — a library, store, or lobby works.",
      "Drink water now, even if you are not thirsty. Skip alcohol and caffeine.",
      "Heat stroke signs: confusion, hot dry skin, no sweating, fainting. That is a 911 call, not a wait.",
      "Wear light clothing, and skip exercise until after sunset.",
      "Check on older neighbors and anyone without AC by phone or text.",
      "NYC opens free cooling centers during extreme heat — call 311 for the closest one.",
    ],
    serviceFact: "311",
    placeKind: "cooling",
    placeLabel: "Air-conditioned places near you",
  },
  tornado: {
    now: "Move to the lowest interior room now — away from windows.",
    spoken:
      "Get to the lowest interior room away from windows right now, and stay there until the warning expires. If you are outside and cannot reach a building, lie flat in a ditch and cover your head.",
    steps: [
      "Right now: go to the lowest floor, an interior room or hallway, away from every window.",
      "Do not stay in a vehicle, and do not shelter under a highway overpass.",
      "Cover your head and neck with your arms, a coat, or a bag.",
      "If you are caught outside with no building, lie flat in the lowest spot you can find.",
      "Stay put until the warning expires — a lull can be the eye, not the end.",
      "After it passes, avoid downed wires and report damage or injuries via 911.",
    ],
    serviceFact: "911",
    placeKind: "shelter",
    placeLabel: "Sturdy buildings near you",
  },
  generic: {
    now: "Get indoors and stay off the street.",
    spoken:
      "Get indoors, stay off the street, and wait for the warning to expire. Keep your phone charged and listen for updates — conditions can get worse before the warning ends.",
    steps: [
      "Right now: move into a sturdy building, away from windows.",
      "Stay off the street until the warning expires — falling debris is the main danger.",
      "Charge your phone and keep this page open for updates.",
      "If someone is hurt or in danger, call 911. For city services, call 311.",
    ],
    serviceFact: "311",
    placeKind: "shelter",
    placeLabel: "Indoor public places near you",
  },
};

export function playbookKeyFor(event: string): keyof typeof WEATHER_PLAYBOOK {
  const e = event.toLowerCase();
  if (e.includes("flood")) return "flood";
  if (e.includes("heat")) return "heat";
  if (e.includes("tornado")) return "tornado";
  return "generic";
}
