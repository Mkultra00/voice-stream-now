// Synthetic, clearly-labeled call simulation used in Demo mode so the full
// flow can be shown live without contacting a real emergency service.

export type SimCall = {
  service: string;
  number: string;
  status: string;
  lines: { who: string; text: string }[];
};

type Ctx = { placeLabel: string; localTime: string; situation?: string; alertEvent?: string | null };

const services: Record<string, { service: string; opener: (c: Ctx) => string; followups: string[] }> = {
  "911": {
    service: "NYC 911 Dispatch",
    opener: (c) =>
      `911, what's the address of your emergency? I have you near ${c.placeLabel}. Is that correct?`,
    followups: [
      "Stay on the line with me. Is the person awake and breathing normally?",
      "An ambulance is dispatched to your location. Keep the phone on speaker and stay where you are.",
      "Wave the crew down when you see them. EMS is about six minutes out.",
    ],
  },
  "311": {
    service: "NYC 311",
    opener: (c) => `NYC 311, how can I help? I show you near ${c.placeLabel}.`,
    followups: [
      "I can file that as a service request and give you a tracking number.",
      "Your request is logged. A crew is scheduled within the next 24 hours.",
    ],
  },
  "988": {
    service: "988 Suicide & Crisis Lifeline",
    opener: () => "988 Lifeline, you reached a counselor. I'm here with you. Are you safe right now?",
    followups: [
      "Thank you for telling me that. Let's slow it down together — take one breath with me.",
      "You don't have to handle this alone. Can you stay on with me while we find someone nearby?",
    ],
  },
  poison: {
    service: "Poison Control Center",
    opener: () => "Poison Control. What was swallowed, how much, and how long ago?",
    followups: [
      "Do not induce vomiting. Keep the container with you.",
      "Watch for drowsiness or trouble breathing. Call back immediately if either starts.",
    ],
  },
};

export function buildSimCall(factId: string, number: string, ctx: Ctx): SimCall {
  const s = services[factId] ?? {
    service: `Line ${number}`,
    opener: (c: Ctx) => `You're connected. I show you near ${c.placeLabel}. Go ahead.`,
    followups: ["Stay on the line, help is being coordinated."],
  };
  const alertNote = ctx.alertEvent ? ` We have an active ${ctx.alertEvent} in your area.` : "";
  return {
    service: s.service,
    number,
    status: `Connected ${ctx.localTime}`,
    lines: [
      { who: s.service, text: s.opener(ctx) + alertNote },
      ...s.followups.map((text) => ({ who: s.service, text })),
    ],
  };
}
