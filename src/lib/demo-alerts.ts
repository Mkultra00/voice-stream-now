import type { LiveAlert } from "./alerts.functions";

export type DemoAlertKey = "flood" | "heat" | "tornado";

export const DEMO_ALERT_LABELS: Record<DemoAlertKey, string> = {
  flood: "Flash Flood Warning",
  heat: "Extreme Heat Warning",
  tornado: "Tornado Warning",
};

// A CAP-shaped fake alert, always tagged source DEMO so nothing can pass as live.
export function buildDemoAlert(key: DemoAlertKey, lat: number, lon: number): LiveAlert {
  const minutes = key === "heat" ? 360 : 90;
  const expires = new Date(Date.now() + minutes * 60_000).toISOString();
  const d = 0.02;
  const polygon: [number, number][] = [
    [lat + d, lon - d],
    [lat + d, lon + d],
    [lat - d, lon + d],
    [lat - d, lon - d],
    [lat + d, lon - d],
  ];

  const content: Record<DemoAlertKey, { headline: string; instruction: string; area: string }> = {
    flood: {
      headline: "Flash Flood Warning issued for Manhattan until further notice (DEMO)",
      instruction:
        "Move to higher ground now. Do not enter subways, basements, or underpasses. Never drive into flooded roadways.",
      area: "Manhattan (DEMO)",
    },
    heat: {
      headline: "Extreme Heat Warning in effect for New York City (DEMO)",
      instruction:
        "Stay in air conditioning, drink water, and check on vulnerable neighbors. Avoid strenuous activity.",
      area: "New York City (DEMO)",
    },
    tornado: {
      headline: "Tornado Warning issued for Brooklyn (DEMO)",
      instruction:
        "Take shelter now in the lowest interior room away from windows. Avoid vehicles and overpasses.",
      area: "Brooklyn (DEMO)",
    },
  };

  return {
    id: `demo-${key}-${Date.now()}`,
    event: DEMO_ALERT_LABELS[key],
    severity: "Severe",
    headline: content[key].headline,
    instruction: content[key].instruction,
    areaDesc: content[key].area,
    expires,
    polygon,
    source: "DEMO",
  };
}
